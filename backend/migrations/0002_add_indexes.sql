-- Migration 0002: performance indexes
CREATE INDEX IF NOT EXISTS idx_tasks_operation_id ON tasks(operation_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_task_id ON task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_prerequisite_id ON task_dependencies(prerequisite_id);
