-- Migration 0004: time tracking
ALTER TABLE tasks ADD COLUMN time_logged INTEGER NOT NULL DEFAULT 0;
