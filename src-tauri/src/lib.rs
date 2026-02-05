mod commands;
mod db;
mod error;
mod models;
mod reaper;

use commands::*;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            std::fs::create_dir_all(&app_dir).expect("failed to create app data dir");

            let pool =
                tauri::async_runtime::block_on(db::init(&app_dir)).expect("failed to init db");

            // Spawn the reaper background task
            reaper::spawn(pool.clone());

            app.manage(pool);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_task,
            get_tasks,
            get_triage_tasks,
            update_task,
            defer_task,
            complete_task,
            delete_task,
            get_domains,
            update_domain,
            get_daily_stats,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
