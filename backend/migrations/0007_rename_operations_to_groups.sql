-- Migration 0007: rename operations → groups, and let groups nest.
--
-- Two changes in one migration, because they are one conceptual move: an
-- "operation" becomes a "group", and a group may now sit inside another group.
--
-- RENAME TABLE / RENAME COLUMN rewrite the REFERENCES clauses in dependent
-- tables automatically (SQLite >= 3.25 with legacy_alter_table off, which is
-- the D1 default), so tasks.group_id keeps pointing at groups(id) without the
-- table-rebuild dance.

PRAGMA foreign_keys=ON;

-- ── Tables ───────────────────────────────────────────────────────────────────

ALTER TABLE operations RENAME TO groups;

ALTER TABLE api_key_operations RENAME TO api_key_groups;
ALTER TABLE api_key_groups RENAME COLUMN operation_id TO group_id;

ALTER TABLE tasks RENAME COLUMN operation_id TO group_id;

-- ── Nesting ──────────────────────────────────────────────────────────────────
-- NULL parent_id means a top-level group. Every existing group becomes
-- top-level, which is exactly the flat structure that was there before.
--
-- No ON DELETE action: the /groups DELETE handler decides between cascading
-- the subtree and promoting children to the deleted group's parent, so the
-- database must not quietly pick one of those for it.

ALTER TABLE groups ADD COLUMN parent_id TEXT REFERENCES groups(id);

-- ── Indexes ──────────────────────────────────────────────────────────────────
-- Indexes survive a table rename but keep their old names, so drop the two
-- that say "operation" and recreate them. Dropping an index is safe to repeat
-- and loses no data.

DROP INDEX IF EXISTS idx_tasks_operation_id;
DROP INDEX IF EXISTS idx_operations_user_id;

CREATE INDEX IF NOT EXISTS idx_tasks_group_id ON tasks(group_id);
CREATE INDEX IF NOT EXISTS idx_groups_user_id ON groups(user_id);

-- Walking a group's children (tree render, subtree delete, stats rollup) is
-- the hot path that nesting introduces.
CREATE INDEX IF NOT EXISTS idx_groups_parent_id ON groups(parent_id);
