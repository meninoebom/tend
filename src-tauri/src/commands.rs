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
) -> Result<Task> {
    let bucket = bucket.unwrap_or_else(|| "today".into());
    let ts = now();
    let date = today();

    let mut tx = db.inner().begin().await?;

    let row = sqlx::query_as::<_, Task>(
        "INSERT INTO tasks (text, bucket, domain, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         RETURNING *",
    )
    .bind(&text)
    .bind(&bucket)
    .bind(domain)
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
    let tasks = sqlx::query_as::<_, Task>(
        "SELECT * FROM tasks WHERE bucket = 'today' AND status = 'pending' ORDER BY created_at ASC",
    )
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
