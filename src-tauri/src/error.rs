use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("task not found: {0}")]
    TaskNotFound(i64),

    #[error("domain not found: {0}")]
    DomainNotFound(i64),

    #[error("domain limit reached (max 5)")]
    DomainLimitReached,

    #[error("sub-tasks cannot have children")]
    NestingTooDeep,
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

pub type Result<T> = std::result::Result<T, Error>;
