import { useState, useMemo } from "react";
import { useTheme } from "../theme/ThemeContext";
import { useStore } from "../store/useStore";
import { getClient, updateTaskInStore } from "../store";
import type { Task } from "@zakhira/core";
import type { ColorTokens } from "@zakhira/ui";

type Filter = "all" | "completed" | "scrapped";

const TYPE_ICONS: Record<string, string> = { main: "⚔", side: "📍", exploration: "⚗" };
const TYPE_LABEL: Record<string, string> = { main: "Main Quest", side: "Side Quest", exploration: "Exploration" };
const PRIORITY_LABEL: Record<number, string> = { 1: "Low", 2: "Medium", 3: "High" };
const PRIORITY_COLOR: Record<number, string> = { 1: "#5aa9f0", 2: "#f59e0b", 3: "#ef4444" };

function tierColor(type: string, tokens: ColorTokens): string {
  if (type === "main") return tokens.tierMain;
  if (type === "side") return tokens.tierSide;
  return tokens.tierExplore;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function groupByMonth(tasks: Task[]): { label: string; tasks: Task[] }[] {
  const groups: Map<string, Task[]> = new Map();
  for (const t of tasks) {
    const d = new Date(t.updatedAt);
    const key = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }
  return Array.from(groups.entries()).map(([label, tasks]) => ({ label, tasks }));
}

export function TaskHistory() {
  const { tokens } = useTheme();
  const store = useStore();
  const [filter, setFilter] = useState<Filter>("all");
  const [recovering, setRecovering] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const opSet = useMemo(() => new Set(store.operations.map((o) => o.id)), [store.operations]);
  const opMap = useMemo(() => new Map(store.operations.map((o) => [o.id, o.name])), [store.operations]);

  const filteredTasks = useMemo(() => {
    return store.tasks
      .filter((t) => {
        if (filter === "completed") return t.state === "completed";
        if (filter === "scrapped") return t.state === "scrapped";
        return t.state === "completed" || t.state === "scrapped";
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [store.tasks, filter]);

  const monthGroups = useMemo(() => groupByMonth(filteredTasks), [filteredTasks]);

  const counts = useMemo(() => ({
    completed: store.tasks.filter((t) => t.state === "completed").length,
    scrapped: store.tasks.filter((t) => t.state === "scrapped").length,
  }), [store.tasks]);

  async function recover(task: Task) {
    setRecovering(task.id); setError(null);
    try {
      const client = getClient();
      if (!client) throw new Error("Not connected");
      const res = await client.updateTask(task.id, { state: "todo" });
      if (!res.ok) { setError(res.error); return; }
      updateTaskInStore(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to recover task");
    } finally { setRecovering(null); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: tokens.bgPage }}>

      {/* ── Header ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 28px", borderBottom: `1px solid ${tokens.border}`,
        backgroundColor: tokens.bgSurface, flexShrink: 0,
      }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: tokens.textPrimary, margin: 0 }}>Task History</h1>
          <div style={{ fontSize: 12, color: tokens.textTertiary, marginTop: 2 }}>
            {counts.completed} completed · {counts.scrapped} scrapped
          </div>
        </div>

        {/* Filter toggles */}
        <div style={{ display: "flex", backgroundColor: "rgba(255,255,255,0.04)", padding: 3, borderRadius: 9, gap: 2 }}>
          {(["all", "completed", "scrapped"] as Filter[]).map((f) => {
            const active = filter === f;
            return (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: "6px 16px", fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: "pointer",
                color: active ? "#16171c" : tokens.textTertiary,
                background: active ? "linear-gradient(145deg, #f5c842 0%, #b8862e 100%)" : "transparent",
                boxShadow: active ? "0 2px 8px rgba(217,164,65,0.4)" : "none",
                letterSpacing: "0.03em", transition: "all 0.15s",
              }}>
                {f === "all" ? "All" : f === "completed" ? "Completed" : "Scrapped"}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── List ── */}
      <div style={{ flex: 1, overflow: "auto", padding: "20px 28px" }}>
        {error && (
          <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 14, padding: "10px 14px", backgroundColor: "rgba(239,68,68,0.08)", borderRadius: 8, border: "1px solid rgba(239,68,68,0.2)" }}>
            {error}
          </div>
        )}

        {filteredTasks.length === 0 && (
          <div style={{ textAlign: "center", marginTop: 80, color: tokens.textTertiary }}>
            <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.4 }}>⊟</div>
            <div style={{ fontSize: 15 }}>
              No {filter === "all" ? "completed or scrapped" : filter} tasks yet.
            </div>
          </div>
        )}

        {monthGroups.map((group) => (
          <section key={group.label} style={{ marginBottom: 32 }}>
            {/* Month heading */}
            <div style={{
              fontSize: 11, fontWeight: 700, color: tokens.textTertiary,
              textTransform: "uppercase", letterSpacing: "0.08em",
              marginBottom: 12, display: "flex", alignItems: "center", gap: 10,
            }}>
              {group.label}
              <div style={{ flex: 1, height: 1, backgroundColor: tokens.border }} />
              <span style={{ fontWeight: 400, color: tokens.textTertiary }}>{group.tasks.length}</span>
            </div>

            {/* Task rows */}
            {group.tasks.map((task) => {
              const tc = tierColor(task.type, tokens);
              const opExists = opSet.has(task.operationId);
              const opName = opMap.get(task.operationId);
              const isCompleted = task.state === "completed";
              const stateColor = isCompleted ? tokens.stateCompleted : tokens.stateScrapped;
              const isRecovering = recovering === task.id;

              return (
                <div key={task.id} style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "14px 18px", marginBottom: 8, borderRadius: 11,
                  background: `linear-gradient(145deg, ${tokens.bgCard} 65%, ${tc}08 100%)`,
                  border: `1px solid ${tokens.border}`,
                  borderLeft: `3px solid ${stateColor}66`,
                  transition: "border-color 0.12s",
                }}>
                  {/* Type icon */}
                  <span style={{ fontSize: 20, flexShrink: 0, opacity: 0.85 }}>{TYPE_ICONS[task.type]}</span>

                  {/* Main info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 14, fontWeight: 600, color: tokens.textPrimary,
                      marginBottom: 5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {task.title}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11, color: tokens.textTertiary }}>
                        {opName ?? <em style={{ opacity: 0.5 }}>deleted operation</em>}
                      </span>
                      <span style={{ fontSize: 10, color: tokens.border }}>·</span>
                      <span style={{ fontSize: 11, color: tc }}>{TYPE_LABEL[task.type]}</span>
                      {task.importance !== null && PRIORITY_LABEL[task.importance] && (
                        <>
                          <span style={{ fontSize: 10, color: tokens.border }}>·</span>
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                            color: PRIORITY_COLOR[task.importance]!,
                            backgroundColor: PRIORITY_COLOR[task.importance]! + "20",
                          }}>
                            {PRIORITY_LABEL[task.importance]}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* State + date */}
                  <div style={{ textAlign: "right", flexShrink: 0, marginRight: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: stateColor, marginBottom: 3 }}>
                      {isCompleted ? "✓ Completed" : "✕ Scrapped"}
                    </div>
                    <div style={{ fontSize: 11, color: tokens.textTertiary }}>
                      {formatDate(task.updatedAt)}
                    </div>
                  </div>

                  {/* Recover button — only if operation exists */}
                  {opExists ? (
                    <button
                      onClick={() => recover(task)}
                      disabled={isRecovering}
                      style={{
                        padding: "8px 18px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                        cursor: isRecovering ? "not-allowed" : "pointer", flexShrink: 0, border: "none",
                        background: "linear-gradient(145deg, #60a5fa 0%, #2563eb 100%)",
                        color: "#fff",
                        boxShadow: "0 3px 12px rgba(37, 99, 235, 0.4)",
                        opacity: isRecovering ? 0.6 : 1,
                        transition: "opacity 0.15s",
                        letterSpacing: "0.01em",
                      }}
                    >
                      {isRecovering ? "Recovering…" : "↩ Recover"}
                    </button>
                  ) : (
                    <span style={{
                      fontSize: 11, color: tokens.textTertiary, flexShrink: 0,
                      padding: "8px 14px", borderRadius: 8,
                      border: `1px solid ${tokens.border}`,
                      opacity: 0.5,
                    }}>
                      Op deleted
                    </span>
                  )}
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}
