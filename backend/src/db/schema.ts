import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

// ─── Users ───────────────────────────────────────────────────────────────────

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ─── Operations ──────────────────────────────────────────────────────────────

export const operations = sqliteTable("operations", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  name: text("name").notNull(),
  description: text("description"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  importance: integer("importance"),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ─── Tasks ───────────────────────────────────────────────────────────────────

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  operationId: text("operation_id")
    .notNull()
    .references(() => operations.id),
  title: text("title").notNull(),
  type: text("type", { enum: ["main", "side", "exploration"] }).notNull(),
  state: text("state", {
    enum: ["todo", "in_progress", "blocked", "completed", "scrapped"],
  })
    .notNull()
    .default("todo"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  importance: integer("importance"),
  notes: text("notes"),
  reminderId: text("reminder_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ─── Task Dependencies ────────────────────────────────────────────────────────

export const taskDependencies = sqliteTable("task_dependencies", {
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id),
  prerequisiteId: text("prerequisite_id")
    .notNull()
    .references(() => tasks.id),
});

// ─── Reminders ───────────────────────────────────────────────────────────────

export const reminders = sqliteTable("reminders", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  taskId: text("task_id").references(() => tasks.id),
  title: text("title").notNull(),
  fireHour: integer("fire_hour").notNull(),
  fireDate: text("fire_date"),
  recurrence: text("recurrence", { enum: ["once", "daily", "yearly"] })
    .notNull()
    .default("once"),
  snoozedUntil: text("snoozed_until"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ─── API Keys ─────────────────────────────────────────────────────────────────

export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  keyHash: text("key_hash").notNull().unique(),
  name: text("name").notNull(),
  scope: text("scope", { enum: ["all", "scoped"] }).notNull(),
  lastUsedAt: text("last_used_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ─── API Key ↔ Operations (scoped keys) ───────────────────────────────────────

export const apiKeyOperations = sqliteTable("api_key_operations", {
  apiKeyId: text("api_key_id")
    .notNull()
    .references(() => apiKeys.id),
  operationId: text("operation_id")
    .notNull()
    .references(() => operations.id),
});

// ─── Relations ────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  apiKeys: many(apiKeys),
  operations: many(operations),
  reminders: many(reminders),
}));

export const operationsRelations = relations(operations, ({ one, many }) => ({
  user: one(users, { fields: [operations.userId], references: [users.id] }),
  tasks: many(tasks),
  apiKeyOperations: many(apiKeyOperations),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  operation: one(operations, {
    fields: [tasks.operationId],
    references: [operations.id],
  }),
  dependenciesAsTask: many(taskDependencies, { relationName: "taskDeps" }),
  dependenciesAsPrereq: many(taskDependencies, { relationName: "prereqDeps" }),
  reminder: one(reminders, {
    fields: [tasks.reminderId],
    references: [reminders.id],
  }),
}));

export const taskDependenciesRelations = relations(taskDependencies, ({ one }) => ({
  task: one(tasks, {
    fields: [taskDependencies.taskId],
    references: [tasks.id],
    relationName: "taskDeps",
  }),
  prerequisite: one(tasks, {
    fields: [taskDependencies.prerequisiteId],
    references: [tasks.id],
    relationName: "prereqDeps",
  }),
}));

export const remindersRelations = relations(reminders, ({ one }) => ({
  user: one(users, { fields: [reminders.userId], references: [users.id] }),
  task: one(tasks, {
    fields: [reminders.taskId],
    references: [tasks.id],
  }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one, many }) => ({
  user: one(users, { fields: [apiKeys.userId], references: [users.id] }),
  apiKeyOperations: many(apiKeyOperations),
}));

export const apiKeyOperationsRelations = relations(apiKeyOperations, ({ one }) => ({
  apiKey: one(apiKeys, {
    fields: [apiKeyOperations.apiKeyId],
    references: [apiKeys.id],
  }),
  operation: one(operations, {
    fields: [apiKeyOperations.operationId],
    references: [operations.id],
  }),
}));
