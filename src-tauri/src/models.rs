use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Task {
    pub id: i64,
    pub text: String,
    pub bucket: String,
    pub domain: Option<i64>,
    pub parent_id: Option<i64>,
    pub status: String,
    pub scheduled_date: Option<String>,
    pub reschedule_count: i64,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Domain {
    pub id: i64,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct DailyStat {
    pub date: String,
    pub tasks_completed: i64,
    pub tasks_added: i64,
}
