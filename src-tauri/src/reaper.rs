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

            // Pass 1: archive stale top-level tasks
            match sqlx::query(
                "UPDATE tasks
                 SET status = 'archived', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
                 WHERE status = 'pending'
                   AND parent_id IS NULL
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

            // Pass 2: archive children whose parent is already archived
            match sqlx::query(
                "UPDATE tasks
                 SET status = 'archived', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
                 WHERE status = 'pending'
                   AND parent_id IS NOT NULL
                   AND parent_id IN (SELECT id FROM tasks WHERE status = 'archived')",
            )
            .execute(&db)
            .await
            {
                Ok(r) if r.rows_affected() > 0 => {
                    eprintln!("[reaper] archived {} orphaned sub-tasks", r.rows_affected());
                }
                Ok(_) => {}
                Err(e) => {
                    eprintln!("[reaper] failed to archive orphaned sub-tasks: {e}");
                }
            }
        }
    });
}
