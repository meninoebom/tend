-- Migration 002: Dynamic domains (up to 5) and sub-tasks (1 level deep)
--
-- Changes:
--   domains: Remove CHECK(id IN (1,2,3)), use AUTOINCREMENT
--   tasks.domain: Remove CHECK(domain IN (1,2,3)), add FK → domains(id) ON DELETE SET NULL
--   tasks.parent_id: New column, FK → tasks(id) ON DELETE CASCADE
--   tasks: Add index on parent_id

-- Disable FK enforcement during table recreation
PRAGMA foreign_keys = OFF;

-- Recreate domains without the id restriction
CREATE TABLE domains_new (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT NOT NULL,
    color TEXT NOT NULL
);
INSERT INTO domains_new (id, name, color) SELECT id, name, color FROM domains;
DROP TABLE domains;
ALTER TABLE domains_new RENAME TO domains;

-- Recreate tasks with proper FKs and parent_id
CREATE TABLE tasks_new (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    text             TEXT NOT NULL,
    bucket           TEXT NOT NULL DEFAULT 'today'
                     CHECK (bucket IN ('today', 'soon', 'later', 'someday')),
    domain           INTEGER REFERENCES domains(id) ON DELETE SET NULL,
    parent_id        INTEGER REFERENCES tasks_new(id) ON DELETE CASCADE,
    status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'complete', 'archived')),
    scheduled_date   TEXT,
    reschedule_count INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    completed_at     TEXT
);

INSERT INTO tasks_new (id, text, bucket, domain, status, scheduled_date,
    reschedule_count, created_at, updated_at, completed_at)
SELECT id, text, bucket, domain, status, scheduled_date,
    reschedule_count, created_at, updated_at, completed_at
FROM tasks;

DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_tasks_bucket_status ON tasks(bucket, status);
CREATE INDEX IF NOT EXISTS idx_tasks_updated ON tasks(updated_at, status);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);

PRAGMA foreign_keys = ON;
