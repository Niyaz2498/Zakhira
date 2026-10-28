-- Migration 0008: task comments.
--
-- `tasks.notes` is a single column, overwritten on every edit, so it holds the
-- task's brief and not its history. Progress recorded as work happens — why a
-- task moved to blocked, what replacement part was ordered, when it arrived —
-- had nowhere to live. A comment is one such entry; a task may have any number.
--
-- Comments are deliberately NOT part of delta sync. They are fetched per task
-- when the task modal opens and that response is authoritative. This is what
-- makes a hard DELETE correct: delta sync merges by id and never removes rows
-- (see apps/*/src/store), so a synced comment deleted on the phone would linger
-- on the desktop indefinitely. Fetch-on-open keeps no local copy to go stale.
--
-- No ON DELETE CASCADE: task_dependencies doesn't use one either, and the task
-- DELETE handler already does its cleanup explicitly. Comments follow suit.

PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS task_comments (
  id         TEXT PRIMARY KEY,
  task_id    TEXT NOT NULL REFERENCES tasks(id),
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Every read is "all comments for this task, oldest first".
CREATE INDEX IF NOT EXISTS idx_task_comments_task_created
  ON task_comments(task_id, created_at);
