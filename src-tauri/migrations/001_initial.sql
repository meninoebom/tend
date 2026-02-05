CREATE TABLE IF NOT EXISTS tasks (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    text             TEXT NOT NULL,
    bucket           TEXT NOT NULL DEFAULT 'today'
                     CHECK (bucket IN ('today', 'soon', 'later', 'someday')),
    domain           INTEGER
                     CHECK (domain IS NULL OR domain IN (1, 2, 3)),
    status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'complete', 'archived')),
    scheduled_date   TEXT,
    reschedule_count INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    completed_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_tasks_bucket_status ON tasks(bucket, status);
CREATE INDEX IF NOT EXISTS idx_tasks_updated ON tasks(updated_at, status);

CREATE TABLE IF NOT EXISTS domains (
    id    INTEGER PRIMARY KEY CHECK (id IN (1, 2, 3)),
    name  TEXT NOT NULL,
    color TEXT NOT NULL
);

INSERT OR IGNORE INTO domains (id, name, color) VALUES
    (1, 'Work',    '#3B82F6'),
    (2, 'Admin',   '#F59E0B'),
    (3, 'Calling', '#10B981');

CREATE TABLE IF NOT EXISTS daily_stats (
    date            TEXT PRIMARY KEY,
    tasks_completed INTEGER NOT NULL DEFAULT 0,
    tasks_added     INTEGER NOT NULL DEFAULT 0
);
