-- Migration 0001: initial schema
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS operations (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  start_date  TEXT,
  end_date    TEXT,
  importance  INTEGER,
  is_default  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id           TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL REFERENCES operations(id),
  title        TEXT NOT NULL,
  type         TEXT NOT NULL CHECK(type IN ('main','side','exploration')),
  state        TEXT NOT NULL DEFAULT 'todo' CHECK(state IN ('todo','in_progress','blocked','completed','scrapped')),
  start_date   TEXT,
  end_date     TEXT,
  importance   INTEGER,
  notes        TEXT,
  reminder_id  TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_dependencies (
  task_id        TEXT NOT NULL REFERENCES tasks(id),
  prerequisite_id TEXT NOT NULL REFERENCES tasks(id),
  PRIMARY KEY (task_id, prerequisite_id)
);

CREATE TABLE IF NOT EXISTS reminders (
  id           TEXT PRIMARY KEY,
  task_id      TEXT REFERENCES tasks(id),
  title        TEXT NOT NULL,
  fire_hour    INTEGER NOT NULL,
  fire_date    TEXT,
  recurrence   TEXT NOT NULL DEFAULT 'once' CHECK(recurrence IN ('once','daily','yearly')),
  snoozed_until TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS api_keys (
  id           TEXT PRIMARY KEY,
  key_hash     TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  scope        TEXT NOT NULL CHECK(scope IN ('all','scoped')),
  last_used_at TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS api_key_operations (
  api_key_id   TEXT NOT NULL REFERENCES api_keys(id),
  operation_id TEXT NOT NULL REFERENCES operations(id),
  PRIMARY KEY (api_key_id, operation_id)
);

-- Seed: General Tasks default operation
INSERT OR IGNORE INTO operations (id, name, description, start_date, end_date, importance, is_default, created_at, updated_at)
VALUES (
  'general-tasks-default',
  'General Tasks',
  NULL, NULL, NULL, NULL,
  1,
  datetime('now'),
  datetime('now')
);
