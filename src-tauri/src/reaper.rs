use crate::db::Db;
use std::time::Duration;
use tokio::time::interval;

/// Background task that archives stale tasks.
/// Tasks in 'soon', 'later', or 'someday' buckets that haven't been
/// updated in 30 days get auto-archived.
pub fn spawn(db: Db) {
    tauri::async_runtime::spawn(async move {
        let mut ticker = interval(Duration::from_secs(3600));
        loop {
            ticker.tick().await;

            match sqlx::query(
                "UPDATE tasks
                 SET status = 'archived', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
                 WHERE status = 'pending'
                   AND bucket != 'today'
                   AND scheduled_date IS NULL
                   AND julianday('now') - julianday(updated_at) >= 30",
            )
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
        }
    });
}
