---
title: "Rust Backend Refactor: sqlx Best Practices for Tauri"
category: code-quality
tags: [rust, sqlx, tauri, sqlite, thiserror, migrations, transactions]
module: src-tauri
symptoms:
  - hand-rolled migration splitting SQL on semicolons
  - 2^n query branch explosion for optional filters
  - string-typed errors losing context
  - non-atomic multi-operation commands
  - background task silently swallowing errors
  - mutations succeeding on invalid IDs
date: 2026-02-05
severity: high
---

# Rust Backend Refactor: sqlx Best Practices for Tauri

## Problem

After rapid prototyping of a Tauri v2 desktop app with sqlx/SQLite backend, a code review identified seven quality issues ranging from critical (fragile migration runner) to low (unused dependency). The issues shared a common root: initial code prioritized "make it work" over Rust/sqlx idioms.

## Symptoms

1. Migration runner split SQL on `;` — would break on semicolons in string literals or trigger bodies
2. `get_tasks` had 8 nearly-identical query branches (2^3 for bucket/domain/archived filters)
3. Every command used `.map_err(|e| e.to_string())` — 20+ instances, all error context lost
4. `create_task` and `complete_task` did insert + stats update as separate operations (not atomic)
5. Reaper background task used `if let Ok(r) = result` — errors vanished
6. `delete_task(999)` returned `Ok(())` — no validation that the row existed
7. `serde_json` in Cargo.toml was never imported

## Root Cause

Prototyping speed. Each issue is a known Rust/sqlx anti-pattern that's easy to write when getting something working fast, but compounds into maintenance and correctness problems.

## Solution

### 1. Replace hand-rolled migration with `sqlx::migrate!()`

**Cargo.toml** — add `"migrate"` feature:
```toml
sqlx = { version = "0.8", features = ["runtime-tokio", "sqlite", "migrate"] }
```

**db.rs** — one line replaces the split-on-semicolon loop:
```rust
pub async fn init(app_dir: &std::path::Path) -> Result<Db, sqlx::Error> {
    // ... pool setup ...
    sqlx::migrate!().run(&pool).await?;
    Ok(pool)
}
```

The macro reads `migrations/` at compile time, tracks applied migrations in `_sqlx_migrations`, and handles multi-statement files correctly.

### 2. QueryBuilder for dynamic WHERE clauses

**Before** — 8 branches for 3 optional filters:
```rust
let tasks = if let Some(b) = &bucket {
    if let Some(d) = domain {
        if include_archived {
            sqlx::query_as("SELECT * FROM tasks WHERE bucket = ? AND domain = ?")...
        } else {
            sqlx::query_as("SELECT * FROM tasks WHERE bucket = ? AND domain = ? AND status != 'archived'")...
        }
    } else if include_archived {
        // ... 5 more branches
```

**After** — linear, each filter is one `if`:
```rust
let mut qb = QueryBuilder::<sqlx::Sqlite>::new("SELECT * FROM tasks WHERE 1=1");

if let Some(b) = &bucket {
    qb.push(" AND bucket = ").push_bind(b.clone());
}
if let Some(d) = domain {
    qb.push(" AND domain = ").push_bind(d);
}
if !include_archived {
    qb.push(" AND status != 'archived'");
}
qb.push(" ORDER BY created_at DESC");

let tasks = qb.build_query_as::<Task>().fetch_all(db.inner()).await?;
```

Adding a 4th filter is 3 lines, not doubling the code. `push_bind()` prevents SQL injection.

### 3. Typed error enum with `thiserror`

**error.rs** (new file):
```rust
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("task not found: {0}")]
    TaskNotFound(i64),

    #[error("domain not found: {0}")]
    DomainNotFound(i64),
}

// Tauri commands require serializable errors
impl Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
```

`#[from]` enables `?` on sqlx errors directly — eliminates all `.map_err(|e| e.to_string())` calls. The manual `Serialize` impl is the standard Tauri pattern for custom error types.

### 4. Transactions for multi-operation commands

```rust
let mut tx = db.inner().begin().await?;

let row = sqlx::query_as::<_, Task>("INSERT INTO tasks ... RETURNING *")
    .fetch_one(&mut *tx)
    .await?;

sqlx::query("INSERT INTO daily_stats ...")
    .execute(&mut *tx)
    .await?;

tx.commit().await?;
Ok(row)
```

Applied to: `create_task`, `complete_task`, `update_task`, `defer_task`, `update_domain`. If any step fails, the transaction rolls back automatically (drop = rollback).

### 5. Log reaper errors

```rust
match sqlx::query("UPDATE tasks SET status = 'archived' ...")
    .execute(&db)
    .await
{
    Ok(r) if r.rows_affected() > 0 => {
        eprintln!("[reaper] archived {} stale tasks", r.rows_affected());
    }
    Ok(_) => {}
    Err(e) => {
        eprintln!("[reaper] failed to archive stale tasks: {e}");
    }
}
```

### 6. Validate `rows_affected()` on mutations

```rust
let r = sqlx::query("DELETE FROM tasks WHERE id = ?")
    .bind(id)
    .execute(db.inner())
    .await?;

if r.rows_affected() == 0 {
    return Err(Error::TaskNotFound(id));
}
```

Applied to: `update_task`, `defer_task`, `complete_task`, `delete_task`, `update_domain`.

### 7. Remove unused `serde_json`

Tauri re-exports serde_json internally. Our code only uses `serde::{Serialize, Deserialize}` derives.

## Files Changed

| File | Change |
|------|--------|
| `src-tauri/Cargo.toml` | +thiserror, +migrate feature, -serde_json, -chrono serde feature |
| `src-tauri/src/error.rs` | NEW — Error enum with Database/TaskNotFound/DomainNotFound |
| `src-tauri/src/db.rs` | Replaced split-on-`;` with `sqlx::migrate!()` |
| `src-tauri/src/commands.rs` | QueryBuilder, transactions, rows_affected, typed errors |
| `src-tauri/src/reaper.rs` | `match` with explicit error logging |
| `src-tauri/src/lib.rs` | Added `mod error;` |

## Prevention

| Rule | How to Catch |
|------|-------------|
| Always use `sqlx::migrate!()` for migrations | Grep for manual SQL splitting in CI |
| Use `QueryBuilder` when >1 optional filter | Flag functions with >2 conditional query branches |
| Typed errors with `thiserror`, never `Result<T, String>` | Grep for `Result.*String` in command files |
| Wrap 2+ DB operations in a transaction | Count `begin()/commit()` pairs match multi-op commands |
| Background tasks must log errors | Verify `spawn()` closures have error handling |
| Check `rows_affected()` after UPDATE/DELETE | Pattern: every mutation followed by zero-check |
| Run `cargo +nightly udeps` before releases | CI step or pre-commit hook |

## Verification

```bash
# Compiles clean
cd src-tauri && cargo check

# App runs and all features work identically
cd .. && npx tauri dev
```

No frontend changes needed — the IPC interface (command names, parameters, return types) is unchanged. All fixes are purely backend correctness and maintainability.
