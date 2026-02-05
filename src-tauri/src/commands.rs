use crate::db::Db;
use crate::error::{Error, Result};
use crate::models::{DailyStat, Domain, Task};
use chrono::Utc;
use sqlx::QueryBuilder;
use tauri::State;

fn now() -> String {
    Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

fn today() -> String {
    Utc::now().format("%Y-%m-%d").to_string()
}

// ── Tasks ──────────────────────────────────────────

#[tauri::command]
pub async fn create_task(
    db: State<'_, Db>,
    text: String,
    bucket: Option<String>,
    domain: Option<i64>,
    parent_id: Option<i64>,
) -> Result<Task> {
    let ts = now();
    let date = today();
    let mut tx = db.inner().begin().await?;

    // If creating a sub-task, validate parent and inherit its bucket/domain
    let (effective_bucket, effective_domain) = if let Some(pid) = parent_id {
        let parent = sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = ?")
            .bind(pid)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(Error::TaskNotFound(pid))?;

        // Enforce 1-level nesting: parent must not be a child itself
        if parent.parent_id.is_some() {
            return Err(Error::NestingTooDeep);
        }

        (parent.bucket.clone(), parent.domain)
    } else {
        (bucket.unwrap_or_else(|| "today".into()), domain)
    };

    let row = sqlx::query_as::<_, Task>(
        "INSERT INTO tasks (text, bucket, domain, parent_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         RETURNING *",
    )
    .bind(&text)
    .bind(&effective_bucket)
    .bind(effective_domain)
    .bind(parent_id)
    .bind(&ts)
    .bind(&ts)
    .fetch_one(&mut *tx)
    .await?;

    sqlx::query(
        "INSERT INTO daily_stats (date, tasks_added) VALUES (?, 1)
         ON CONFLICT(date) DO UPDATE SET tasks_added = tasks_added + 1",
    )
    .bind(&date)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(row)
}

#[tauri::command]
pub async fn get_tasks(
    db: State<'_, Db>,
    bucket: Option<String>,
    domain: Option<i64>,
    include_archived: Option<bool>,
) -> Result<Vec<Task>> {
    let include_archived = include_archived.unwrap_or(false);

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

    let tasks = qb
        .build_query_as::<Task>()
        .fetch_all(db.inner())
        .await?;

    Ok(tasks)
}

#[tauri::command]
pub async fn get_triage_tasks(db: State<'_, Db>) -> Result<Vec<Task>> {
    // Only top-level tasks appear in triage; sub-tasks are triaged with their parent
    let tasks = sqlx::query_as::<_, Task>(
        "SELECT * FROM tasks
         WHERE bucket = 'today' AND status = 'pending' AND parent_id IS NULL
         ORDER BY created_at ASC",
    )
    .fetch_all(db.inner())
    .await?;

    Ok(tasks)
}

#[tauri::command]
pub async fn get_subtasks(db: State<'_, Db>, parent_id: i64) -> Result<Vec<Task>> {
    let tasks = sqlx::query_as::<_, Task>(
        "SELECT * FROM tasks WHERE parent_id = ? ORDER BY created_at ASC",
    )
    .bind(parent_id)
    .fetch_all(db.inner())
    .await?;

    Ok(tasks)
}

#[tauri::command]
pub async fn update_task(
    db: State<'_, Db>,
    id: i64,
    text: Option<String>,
    domain: Option<i64>,
) -> Result<Task> {
    let ts = now();
    let mut tx = db.inner().begin().await?;

    if let Some(t) = &text {
        let r = sqlx::query("UPDATE tasks SET text = ?, updated_at = ? WHERE id = ?")
            .bind(t)
            .bind(&ts)
            .bind(id)
            .execute(&mut *tx)
            .await?;
        if r.rows_affected() == 0 {
            return Err(Error::TaskNotFound(id));
        }
    }

    if let Some(d) = domain {
        let domain_val = if d == 0 { None } else { Some(d) };
        sqlx::query("UPDATE tasks SET domain = ?, updated_at = ? WHERE id = ?")
            .bind(domain_val)
            .bind(&ts)
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }

    let task = sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = ?")
        .bind(id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(Error::TaskNotFound(id))?;

    tx.commit().await?;
    Ok(task)
}

#[tauri::command]
pub async fn defer_task(db: State<'_, Db>, id: i64, new_bucket: String) -> Result<Task> {
    let ts = now();
    let mut tx = db.inner().begin().await?;

    let r = sqlx::query(
        "UPDATE tasks SET bucket = ?, reschedule_count = reschedule_count + 1, updated_at = ? WHERE id = ?",
    )
    .bind(&new_bucket)
    .bind(&ts)
    .bind(id)
    .execute(&mut *tx)
    .await?;

    if r.rows_affected() == 0 {
        return Err(Error::TaskNotFound(id));
    }

    // Cascade: move children to the same bucket
    sqlx::query("UPDATE tasks SET bucket = ?, updated_at = ? WHERE parent_id = ?")
        .bind(&new_bucket)
        .bind(&ts)
        .bind(id)
        .execute(&mut *tx)
        .await?;

    let task = sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = ?")
        .bind(id)
        .fetch_one(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(task)
}

#[tauri::command]
pub async fn complete_task(db: State<'_, Db>, id: i64) -> Result<Task> {
    let ts = now();
    let date = today();
    let mut tx = db.inner().begin().await?;

    let r = sqlx::query(
        "UPDATE tasks SET status = 'complete', completed_at = ?, updated_at = ? WHERE id = ?",
    )
    .bind(&ts)
    .bind(&ts)
    .bind(id)
    .execute(&mut *tx)
    .await?;

    if r.rows_affected() == 0 {
        return Err(Error::TaskNotFound(id));
    }

    // Auto-complete pending children
    sqlx::query(
        "UPDATE tasks SET status = 'complete', completed_at = ?, updated_at = ?
         WHERE parent_id = ? AND status = 'pending'",
    )
    .bind(&ts)
    .bind(&ts)
    .bind(id)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        "INSERT INTO daily_stats (date, tasks_completed) VALUES (?, 1)
         ON CONFLICT(date) DO UPDATE SET tasks_completed = tasks_completed + 1",
    )
    .bind(&date)
    .execute(&mut *tx)
    .await?;

    let task = sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = ?")
        .bind(id)
        .fetch_one(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(task)
}

#[tauri::command]
pub async fn delete_task(db: State<'_, Db>, id: i64) -> Result<()> {
    // ON DELETE CASCADE handles children automatically
    let r = sqlx::query("DELETE FROM tasks WHERE id = ?")
        .bind(id)
        .execute(db.inner())
        .await?;

    if r.rows_affected() == 0 {
        return Err(Error::TaskNotFound(id));
    }
    Ok(())
}

// ── Domains ────────────────────────────────────────

#[tauri::command]
pub async fn get_domains(db: State<'_, Db>) -> Result<Vec<Domain>> {
    let domains = sqlx::query_as::<_, Domain>("SELECT * FROM domains ORDER BY id")
        .fetch_all(db.inner())
        .await?;
    Ok(domains)
}

#[tauri::command]
pub async fn create_domain(db: State<'_, Db>, name: String, color: String) -> Result<Domain> {
    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM domains")
        .fetch_one(db.inner())
        .await?;

    if count.0 >= 5 {
        return Err(Error::DomainLimitReached);
    }

    let domain = sqlx::query_as::<_, Domain>(
        "INSERT INTO domains (name, color) VALUES (?, ?) RETURNING *",
    )
    .bind(&name)
    .bind(&color)
    .fetch_one(db.inner())
    .await?;

    Ok(domain)
}

#[tauri::command]
pub async fn delete_domain(db: State<'_, Db>, id: i64) -> Result<()> {
    // ON DELETE SET NULL handles untagging tasks automatically
    let r = sqlx::query("DELETE FROM domains WHERE id = ?")
        .bind(id)
        .execute(db.inner())
        .await?;

    if r.rows_affected() == 0 {
        return Err(Error::DomainNotFound(id));
    }
    Ok(())
}

#[tauri::command]
pub async fn update_domain(
    db: State<'_, Db>,
    id: i64,
    name: Option<String>,
    color: Option<String>,
) -> Result<Domain> {
    let mut tx = db.inner().begin().await?;

    if let Some(n) = &name {
        let r = sqlx::query("UPDATE domains SET name = ? WHERE id = ?")
            .bind(n)
            .bind(id)
            .execute(&mut *tx)
            .await?;
        if r.rows_affected() == 0 {
            return Err(Error::DomainNotFound(id));
        }
    }
    if let Some(c) = &color {
        sqlx::query("UPDATE domains SET color = ? WHERE id = ?")
            .bind(c)
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }

    let domain = sqlx::query_as::<_, Domain>("SELECT * FROM domains WHERE id = ?")
        .bind(id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(Error::DomainNotFound(id))?;

    tx.commit().await?;
    Ok(domain)
}

// ── Stats ──────────────────────────────────────────

#[tauri::command]
pub async fn get_daily_stats(db: State<'_, Db>, days: Option<i64>) -> Result<Vec<DailyStat>> {
    let days = days.unwrap_or(30);
    let stats = sqlx::query_as::<_, DailyStat>(
        "SELECT * FROM daily_stats ORDER BY date DESC LIMIT ?",
    )
    .bind(days)
    .fetch_all(db.inner())
    .await?;
    Ok(stats)
}
