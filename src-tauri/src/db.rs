use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{Pool, Sqlite};
use std::str::FromStr;

pub type Db = Pool<Sqlite>;

pub async fn init(app_dir: &std::path::Path) -> Result<Db, sqlx::Error> {
    let db_path = app_dir.join("tend.db");
    let db_url = format!("sqlite:{}?mode=rwc", db_path.display());

    let opts = SqliteConnectOptions::from_str(&db_url)?
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
        .create_if_missing(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(opts)
        .await?;

    sqlx::migrate!().run(&pool).await?;

    Ok(pool)
}
