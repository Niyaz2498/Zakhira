import { useState, useMemo } from "react";
import type { CSSProperties } from "react";
import { useTheme } from "../theme/ThemeContext";
import { useStore } from "../store/useStore";
import { getClient, addTask } from "../store";
import { TaskModal } from "../components/TaskModal";
import { CustomSelect } from "../components/FormControls";
import type { Task, TaskType, TaskState } from "@zakhira/core";

type GroupBy = "type" | "operation" | "status";
type ChartMode = "status" | "type";
type Priority = "low" | "medium" | "high";
const PRIORITY_VALUE: Record<Priority, number> = { low: 1, medium: 2, high: 3 };
const TYPE_LABELS: Record<string, string> = { main: "Main Quests", side: "Side Quests", exploration: "Exploration" };
const TYPE_ICONS: Record<string, string> = { main: "⚔", side: "📍", exploration: "⚗" };

const CHART_STATUS = [
  { key: "todo",         label: "To-Do",       color: "#64748b" },
  { key: "in_progress",  label: "In Progress",  color: "#3b82f6" },
  { key: "blocked",      label: "Blocked",      color: "#f59e0b" },
  { key: "completed",    label: "Completed",    color: "#22c55e" },
  { key: "scrapped",     label: "Scrapped",     color: "#475569" },
];
const CHART_TYPE = [
  { key: "main",         label: "Main Quest",   color: "#eab308" },
  { key: "side",         label: "Side Quest",   color: "#60a5fa" },
  { key: "exploration",  label: "Exploration",  color: "#f97316" },
];

function tierColor(type: string, tokens: any): string {
  if (type === "main") return tokens.tierMain;
  if (type === "side") return tokens.tierSide;
  return tokens.tierExplore;
}
function stateColor(state: string, tokens: any): string {
  const m: Record<string, string> = {
    todo: tokens.stateTodo, in_progress: tokens.stateInProgress,
    blocked: tokens.stateBlocked, completed: tokens.stateCompleted, scrapped: tokens.stateScrapped,
  };
  return m[state] ?? tokens.stateTodo;
}
function isThisMonth(iso: string): boolean {
  const d = new Date(iso), n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
}
function isOverdue(task: Task): boolean {
  if (!task.endDate || task.state === "completed" || task.state === "scrapped") return false;
  return task.endDate < new Date().toISOString().slice(0, 10);
}

// ── SVG Doughnut ────────────────────────────────────────────────────────────

interface Segment { value: number; color: string; label: string }

function arcPath(cx: number, cy: number, R: number, r: number, a1: number, a2: number): string {
  const cos = Math.cos, sin = Math.sin;
  const f = (n: number) => n.toFixed(3);
  const x1 = cx + R * cos(a1), y1 = cy + R * sin(a1);
  const x2 = cx + R * cos(a2), y2 = cy + R * sin(a2);
  const ix1 = cx + r * cos(a2), iy1 = cy + r * sin(a2);
  const ix2 = cx + r * cos(a1), iy2 = cy + r * sin(a1);
  const large = a2 - a1 > Math.PI ? 1 : 0;
  return `M ${f(x1)} ${f(y1)} A ${R} ${R} 0 ${large} 1 ${f(x2)} ${f(y2)} L ${f(ix1)} ${f(iy1)} A ${r} ${r} 0 ${large} 0 ${f(ix2)} ${f(iy2)} Z`;
}

function DoughnutChart({ segments, tokens, size = 180 }: { segments: Segment[]; tokens: any; size?: number }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const total = segments.reduce((s, g) => s + g.value, 0);
  const cx = size / 2, cy = size / 2;
  const R = Math.round(size * 0.44), r = Math.round(size * 0.29);
  const GAP = 0.04;

  let angle = -Math.PI / 2;
  const paths = total === 0 ? [] : segments
    .filter((s) => s.value > 0)
    .map((seg) => {
      const span = (seg.value / total) * 2 * Math.PI;
      const a1 = angle + GAP / 2, a2 = angle + span - GAP / 2;
      angle += span;
      return { ...seg, d: a2 > a1 ? arcPath(cx, cy, R, r, a1, a2) : null };
    })
    .filter((p) => p.d !== null);

  const hovSeg = hovered !== null ? (paths[hovered] ?? null) : null;

  return (
    <div style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
      <svg
        width={size} height={size} viewBox={`0 0 ${size} ${size}`}
        style={{ filter: "drop-shadow(0 4px 16px rgba(0,0,0,0.35))", flexShrink: 0 }}
      >
        <defs>
          <radialGradient id="holeGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={tokens.bgSurface} />
            <stop offset="100%" stopColor={tokens.bgCard} />
          </radialGradient>
        </defs>
        {total === 0
          ? <circle cx={cx} cy={cy} r={(R + r) / 2} fill="none" stroke={tokens.border} strokeWidth={R - r} />
          : paths.map((p, i) => (
              <path
                key={i}
                d={p.d!}
                fill={p.color}
                style={{
                  cursor: "pointer",
                  opacity: hovered !== null && hovered !== i ? 0.4 : 1,
                  filter: hovered === i ? `brightness(1.25) drop-shadow(0 0 6px ${p.color}99)` : "none",
                  transition: "opacity 0.18s, filter 0.18s",
                }}
                onMouseEnter={(e) => { setHovered(i); setMousePos({ x: e.clientX, y: e.clientY }); }}
                onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setHovered(null)}
              />
            ))
        }
        <circle cx={cx} cy={cy} r={r - 1} fill="url(#holeGrad)" style={{ pointerEvents: "none" }} />
        <text x={cx} y={cy - 7} textAnchor="middle" fill={tokens.textPrimary}
          fontSize={Math.round(size * 0.165)} fontWeight="800" fontFamily="system-ui, sans-serif"
          style={{ pointerEvents: "none" }}>
          {hovSeg ? hovSeg.value : total}
        </text>
        <text x={cx} y={cy + Math.round(size * 0.1)} textAnchor="middle"
          fill={hovSeg ? hovSeg.color : tokens.textTertiary}
          fontSize={Math.round(size * 0.072)} fontFamily="system-ui, sans-serif"
          style={{ pointerEvents: "none" }}>
          {hovSeg ? hovSeg.label : "tasks"}
        </text>
      </svg>

      {/* Hover tooltip */}
      {hovSeg && (
        <div style={{
          position: "fixed",
          left: mousePos.x + 14,
          top: mousePos.y - 58,
          backgroundColor: "#0c0e13",
          border: `1px solid ${hovSeg.color}55`,
          borderRadius: 9,
          padding: "9px 14px",
          boxShadow: `0 8px 28px rgba(0,0,0,0.65), 0 0 0 1px ${hovSeg.color}11`,
          pointerEvents: "none",
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          gap: 8,
          whiteSpace: "nowrap",
        }}>
          <span style={{
            width: 10, height: 10, borderRadius: 3, display: "inline-block", flexShrink: 0,
            backgroundColor: hovSeg.color, boxShadow: `0 0 8px ${hovSeg.color}`,
          }} />
          <span style={{ fontSize: 12, color: "#9aa0ac" }}>{hovSeg.label}</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: "#e8e6e2", letterSpacing: "-0.02em", fontFamily: "system-ui" }}>
            {hovSeg.value}
          </span>
          <span style={{ fontSize: 11, color: "#6b7280", paddingLeft: 2 }}>
            {total > 0 ? `${Math.round((hovSeg.value / total) * 100)}%` : "0%"}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, color, icon, tokens }: { label: string; value: number; color: string; icon: string; tokens: any }) {
  return (
    <div style={{
      borderRadius: 12, padding: "16px 18px 16px 22px",
      position: "relative", overflow: "hidden",
      background: `linear-gradient(135deg, ${tokens.bgCard} 55%, ${color}1a 100%)`,
      border: `1px solid ${tokens.border}`,
    }}>
      <div style={{ position: "absolute", top: 0, left: 0, width: 4, height: "100%", backgroundColor: color, borderRadius: "12px 0 0 12px", boxShadow: `0 0 12px ${color}88` }} />
      <div style={{ fontSize: 11, fontWeight: 600, color: tokens.textTertiary, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10, display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ color, fontSize: 12 }}>{icon}</span>
        {label}
      </div>
      <div style={{ fontSize: 44, fontWeight: 800, color: tokens.textPrimary, lineHeight: 1, letterSpacing: "-0.03em", fontFamily: "system-ui, sans-serif" }}>
        {value}
      </div>
    </div>
  );
}

// ── Pill toggle ──────────────────────────────────────────────────────────────

function PillToggle({ options, value, onChange }: { options: { key: string; label: string }[]; value: string; onChange: (k: string) => void }) {
  return (
    <div style={{ display: "flex", border: `1px solid ${undefined}`, borderRadius: 8, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.05)", padding: 2, gap: 2 }}>
      {options.map((o) => (
        <button key={o.key} onClick={() => onChange(o.key)} style={{
          padding: "5px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer", borderRadius: 6,
          color: value === o.key ? "#16171c" : "#86837c",
          background: value === o.key ? "linear-gradient(145deg, #f5c842 0%, #b8862e 100%)" : "transparent",
          boxShadow: value === o.key ? "0 2px 6px rgba(217,164,65,0.4)" : "none",
          letterSpacing: "0.03em",
          transition: "all 0.15s",
        }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Task tile ────────────────────────────────────────────────────────────────

function TaskTile({ task, opName, tokens, onClick }: { task: Task; opName: string; tokens: any; onClick: () => void }) {
  const PRIORITY_LABEL: Record<number, string> = { 1: "Low", 2: "Medium", 3: "High" };
  const PRIORITY_COLOR: Record<number, string> = { 1: "#5aa9f0", 2: "#f59e0b", 3: "#ef4444" };
  const priority = task.importance !== null ? PRIORITY_LABEL[task.importance] : null;
  const priorityColor = task.importance !== null ? PRIORITY_COLOR[task.importance] : null;
  const overdue = isOverdue(task);
  const tc = tierColor(task.type, tokens);
  return (
    <div onClick={onClick} style={{
      backgroundColor: tokens.bgCard, border: `1.5px solid ${tc}`,
      borderRadius: 12, padding: "14px 16px",
      width: "calc(25% - 8px)", minWidth: 170, cursor: "pointer",
      position: "relative",
      background: `linear-gradient(145deg, ${tokens.bgCard} 60%, ${tc}0d 100%)`,
      boxShadow: `0 2px 8px rgba(0,0,0,0.2)`,
      transition: "box-shadow 0.15s",
    }}>
      {overdue && <div style={{ position: "absolute", top: 10, right: 10, width: 7, height: 7, borderRadius: "50%", backgroundColor: "#ef4444", boxShadow: "0 0 6px #ef444488" }} />}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: tokens.textTertiary }}>{TYPE_ICONS[task.type]} {opName}</span>
        <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: stateColor(task.state, tokens), display: "inline-block", marginTop: 2, boxShadow: `0 0 6px ${stateColor(task.state, tokens)}88` }} />
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: tokens.textPrimary, lineHeight: 1.4, marginBottom: 8 }}>{task.title}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {task.endDate && <span style={{ fontSize: 11, color: overdue ? "#ef4444" : tokens.textTertiary }}>Due {task.endDate}</span>}
        {priority && (
          <span style={{
            fontSize: 10, fontWeight: 700, color: priorityColor!,
            backgroundColor: priorityColor! + "22", borderRadius: 4,
            padding: "2px 7px", letterSpacing: "0.04em",
            boxShadow: `0 0 6px ${priorityColor}44`,
          }}>{priority}</span>
        )}
      </div>
    </div>
  );
}

// ── Create task modal ────────────────────────────────────────────────────────

function FieldLabel({ text, required }: { text: string; required?: boolean }) {
  return (
    <span style={{ display: "block", fontSize: 11, color: "#a4a8b0", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>
      {text}{required && <span style={{ color: "#e05555", marginLeft: 2 }}>*</span>}
    </span>
  );
}

function CreateTaskModal({ defaultOpId, tokens, onClose }: { defaultOpId: string; tokens: any; onClose: () => void }) {
  const store = useStore();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<TaskType>("main");
  const [opId, setOpId] = useState(defaultOpId);
  const [priority, setPriority] = useState<Priority | "">("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!title.trim()) { setError("Title is required."); return; }
    setSaving(true); setError(null);
    try {
      const client = getClient();
      if (!client) throw new Error("Not connected");
      const res = await client.createTask({
        title: title.trim(), operationId: opId, type,
        importance: priority !== "" ? PRIORITY_VALUE[priority] : undefined,
        notes: notes.trim() || undefined,
      });
      if (!res.ok) { setError(res.error); return; }
      addTask(res.data);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create task.");
    } finally { setSaving(false); }
  }

  const inp: CSSProperties = {
    width: "100%", padding: "9px 11px", backgroundColor: tokens.bgInput,
    border: `1px solid ${tokens.border}`, borderRadius: 8, color: tokens.textPrimary,
    fontSize: 14, outline: "none", boxSizing: "border-box",
  };

  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: 460, backgroundColor: tokens.bgCard, border: `1px solid ${tokens.borderStrong}`, borderRadius: 14, padding: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: tokens.textPrimary }}>Create Task</h2>
          <button onClick={onClose} style={{ color: tokens.textTertiary, fontSize: 20, lineHeight: 1, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={{ display: "block" }}>
            <FieldLabel text="Title" required />
            <input style={inp} autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()} placeholder="What needs to be done?" />
          </label>
          <div>
            <FieldLabel text="Operation" required />
            <CustomSelect
              value={opId}
              onChange={setOpId}
              options={store.operations.map((op) => ({ value: op.id, label: op.name }))}
              tokens={tokens}
            />
          </div>
          <div>
            <FieldLabel text="Type" required />
            <div style={{ display: "flex", gap: 8 }}>
              {(["main", "side", "exploration"] as TaskType[]).map((t) => (
                <button key={t} onClick={() => setType(t)} style={{
                  flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer",
                  border: `1px solid ${type === t ? tierColor(t, tokens) : tokens.border}`,
                  backgroundColor: type === t ? tierColor(t, tokens) + "22" : tokens.bgInput,
                  color: type === t ? tierColor(t, tokens) : tokens.textSecondary,
                }}>
                  {TYPE_ICONS[t]} {t === "main" ? "Main" : t === "side" ? "Side" : "Explore"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <FieldLabel text="Priority" />
            <div style={{ display: "flex", gap: 8 }}>
              {(["low", "medium", "high"] as Priority[]).map((p) => {
                const active = priority === p;
                const colors: Record<Priority, string> = { low: "#5aa9f0", medium: "#f59e0b", high: "#ef4444" };
                return (
                  <button key={p} onClick={() => setPriority(active ? "" : p)} style={{
                    flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer",
                    border: `1px solid ${active ? colors[p] : tokens.border}`,
                    backgroundColor: active ? colors[p] + "22" : tokens.bgInput,
                    color: active ? colors[p] : tokens.textSecondary,
                  }}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                );
              })}
            </div>
          </div>
          <label style={{ display: "block" }}>
            <FieldLabel text="Notes" />
            <textarea style={{ ...inp, resize: "vertical", minHeight: 72, fontFamily: "inherit" }}
              value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any extra context…" />
          </label>
        </div>
        {error && <div style={{ color: "#ef4444", fontSize: 13, marginTop: 12 }}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{ padding: "9px 18px", borderRadius: 8, fontSize: 14, fontWeight: 500, border: `1px solid ${tokens.border}`, color: tokens.textSecondary, backgroundColor: tokens.bgSurface, cursor: "pointer" }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{
            padding: "9px 22px", borderRadius: 8, fontSize: 14, fontWeight: 700,
            background: "linear-gradient(145deg, #f5c842 0%, #b8862e 100%)",
            boxShadow: "0 4px 14px rgba(217,164,65,0.4)",
            color: "#16171c", opacity: saving ? 0.6 : 1,
            cursor: saving ? "not-allowed" : "pointer", border: "none",
          }}>
            {saving ? "Creating…" : "Create Task"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Dashboard ────────────────────────────────────────────────────────────────

export function Dashboard() {
  const { tokens } = useTheme();
  const store = useStore();
  const [groupBy, setGroupBy] = useState<GroupBy>("type");
  const [chartMode, setChartMode] = useState<ChartMode>("status");
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const defaultOp = store.operations.find((o) => o.isDefault);
  const opMap = useMemo(() => new Map(store.operations.map((o) => [o.id, o.name])), [store.operations]);
  const activeTasks = useMemo(
    () => store.tasks.filter((t) => t.state !== "completed" && t.state !== "scrapped"),
    [store.tasks]
  );

  const stats = useMemo(() => ({
    todo: store.tasks.filter((t) => t.state === "todo").length,
    inProgress: store.tasks.filter((t) => t.state === "in_progress").length,
    blocked: store.tasks.filter((t) => t.state === "blocked").length,
    overdue: store.tasks.filter(isOverdue).length,
    completedMonth: store.tasks.filter((t) => t.state === "completed" && isThisMonth(t.updatedAt)).length,
    scrappedMonth: store.tasks.filter((t) => t.state === "scrapped" && isThisMonth(t.updatedAt)).length,
  }), [store.tasks]);

  const chartSegments: Segment[] = useMemo(() => {
    if (chartMode === "status") {
      const counts: Record<string, number> = {};
      for (const t of store.tasks) counts[t.state] = (counts[t.state] ?? 0) + 1;
      return CHART_STATUS.map((s) => ({ label: s.label, color: s.color, value: counts[s.key] ?? 0 }));
    }
    const counts: Record<string, number> = {};
    for (const t of store.tasks) counts[t.type] = (counts[t.type] ?? 0) + 1;
    return CHART_TYPE.map((s) => ({ label: s.label, color: s.color, value: counts[s.key] ?? 0 }));
  }, [chartMode, store.tasks]);

  const STATUS_GROUP_ORDER: TaskState[] = ["todo", "in_progress", "blocked"];
  const STATUS_GROUP_LABEL: Record<string, string> = {
    todo: "To-Do", in_progress: "In Progress", blocked: "Blocked",
  };

  const groups = useMemo(() => {
    if (groupBy === "type") {
      return (["main", "side", "exploration"] as const)
        .map((type) => ({ key: type, title: TYPE_LABELS[type]!, tasks: activeTasks.filter((t) => t.type === type) }))
        .filter((g) => g.tasks.length > 0);
    }
    if (groupBy === "status") {
      return STATUS_GROUP_ORDER
        .map((s) => ({ key: s, title: STATUS_GROUP_LABEL[s]!, tasks: activeTasks.filter((t) => t.state === s) }))
        .filter((g) => g.tasks.length > 0);
    }
    return store.operations
      .map((op) => ({ key: op.id, title: op.name, tasks: activeTasks.filter((t) => t.operationId === op.id) }))
      .filter((g) => g.tasks.length > 0);
  }, [groupBy, activeTasks, store.operations]);

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const totalTasks = store.tasks.length;

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", backgroundColor: tokens.bgPage }}>

        {/* ── Top bar ──────────────────────────────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 28px", backgroundColor: tokens.bgSurface,
          borderBottom: `1px solid ${tokens.border}`, flexShrink: 0,
        }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: tokens.textPrimary, margin: 0, letterSpacing: "-0.02em" }}>
              Welcome back{store.displayName ? `, ${store.displayName}` : ""}
            </h1>
            <div style={{ fontSize: 12, color: tokens.textTertiary, marginTop: 3 }}>
              {today} · {totalTasks} total task{totalTasks !== 1 ? "s" : ""}
            </div>
          </div>
          <button onClick={() => setShowCreateTask(true)} style={{
            padding: "10px 22px", fontWeight: 700, fontSize: 14, borderRadius: 10, cursor: "pointer",
            background: "linear-gradient(145deg, #f5c842 0%, #b8862e 100%)",
            boxShadow: "0 4px 18px rgba(217,164,65,0.45)",
            color: "#16171c", border: "none", letterSpacing: "0.01em",
          }}>
            + Create Task
          </button>
        </div>

        {/* ── Stats + chart bento grid ──────────────────────────────────── */}
        <div style={{ padding: "18px 24px", flexShrink: 0, borderBottom: `1px solid ${tokens.border}` }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr) 380px",
            gridTemplateRows: "auto auto",
            gap: 10,
          }}>
            {/* Row 1 stat cards */}
            <StatCard label="To-Do"       value={stats.todo}       color={tokens.stateTodo}       icon="○"  tokens={tokens} />
            <StatCard label="In Progress" value={stats.inProgress}  color={tokens.stateInProgress} icon="▶"  tokens={tokens} />
            <StatCard label="Blocked"     value={stats.blocked}     color={tokens.stateBlocked}    icon="⊘"  tokens={tokens} />
            {/* Row 2 stat cards */}
            <StatCard label="Overdue"          value={stats.overdue}       color="#ef4444"              icon="⚠"  tokens={tokens} />
            <StatCard label="Done This Month"  value={stats.completedMonth} color={tokens.stateCompleted} icon="✓"  tokens={tokens} />
            <StatCard label="Scrapped / Month" value={stats.scrappedMonth}  color={tokens.stateScrapped}  icon="✕"  tokens={tokens} />

            {/* Chart panel — spans both rows, right column */}
            <div style={{
              gridRow: "1 / 3",
              backgroundColor: tokens.bgCard,
              border: `1px solid ${tokens.borderStrong}`,
              borderRadius: 14,
              padding: "16px 20px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}>
              {/* Panel header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: tokens.textSecondary, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Task Overview
                </span>
                <PillToggle
                  options={[{ key: "status", label: "By Status" }, { key: "type", label: "By Type" }]}
                  value={chartMode}
                  onChange={(k) => setChartMode(k as ChartMode)}
                />
              </div>

              {/* Chart + legend horizontal */}
              <div style={{ display: "flex", alignItems: "center", gap: 18, flex: 1 }}>
                <DoughnutChart segments={chartSegments} tokens={tokens} size={170} />

                {/* Legend */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 9 }}>
                  {chartSegments.map((s) => {
                    const pct = chartSegments.reduce((a, b) => a + b.value, 0) > 0
                      ? Math.round((s.value / chartSegments.reduce((a, b) => a + b.value, 0)) * 100)
                      : 0;
                    return (
                      <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{
                          width: 11, height: 11, borderRadius: 3, flexShrink: 0, display: "inline-block",
                          backgroundColor: s.color, boxShadow: `0 2px 8px ${s.color}77`,
                        }} />
                        <span style={{ fontSize: 12, color: tokens.textSecondary, flex: 1, lineHeight: 1 }}>{s.label}</span>
                        <span style={{ fontSize: 18, fontWeight: 800, color: s.value > 0 ? tokens.textPrimary : tokens.textTertiary, letterSpacing: "-0.02em", fontFamily: "system-ui, sans-serif", lineHeight: 1 }}>
                          {s.value}
                        </span>
                        {s.value > 0 && (
                          <span style={{ fontSize: 10, color: tokens.textTertiary, fontWeight: 500, width: 32, textAlign: "right" }}>{pct}%</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Active tasks ─────────────────────────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 28px", backgroundColor: tokens.bgSurface,
          borderBottom: `1px solid ${tokens.border}`, flexShrink: 0,
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: tokens.textSecondary, textTransform: "uppercase", letterSpacing: "0.07em" }}>
            Active Tasks
            <span style={{ marginLeft: 8, fontWeight: 400, color: tokens.textTertiary }}>{activeTasks.length}</span>
          </span>
          <PillToggle
            options={[
              { key: "type", label: "By Type" },
              { key: "operation", label: "By Operation" },
              { key: "status", label: "By Task Type" },
            ]}
            value={groupBy}
            onChange={(k) => setGroupBy(k as GroupBy)}
          />
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
          {groups.length === 0 && (
            <div style={{ textAlign: "center", marginTop: 60, color: tokens.textTertiary }}>
              <div style={{ fontSize: 15, marginBottom: 12 }}>No active tasks</div>
              <button onClick={() => setShowCreateTask(true)} style={{
                padding: "10px 22px", fontWeight: 700, fontSize: 14, borderRadius: 9, cursor: "pointer",
                background: "linear-gradient(145deg, #f5c842 0%, #b8862e 100%)",
                boxShadow: "0 4px 14px rgba(217,164,65,0.4)",
                color: "#16171c", border: "none",
              }}>+ Create your first task</button>
            </div>
          )}
          {groups.map((group) => (
            <section key={group.key} style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 11, fontWeight: 700, color: tokens.textSecondary, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
                {group.title}
                <span style={{ marginLeft: 7, fontWeight: 400, color: tokens.textTertiary }}>{group.tasks.length}</span>
              </h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                {group.tasks.map((task) => (
                  <TaskTile key={task.id} task={task} opName={opMap.get(task.operationId) ?? ""} tokens={tokens} onClick={() => setSelectedTask(task)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      {showCreateTask && defaultOp && (
        <CreateTaskModal defaultOpId={defaultOp.id} tokens={tokens} onClose={() => setShowCreateTask(false)} />
      )}
      {selectedTask && (
        <TaskModal
          task={selectedTask}
          allTasksInOp={store.tasks.filter((t) => t.operationId === selectedTask.operationId)}
          opName={opMap.get(selectedTask.operationId) ?? ""}
          tokens={tokens}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </>
  );
}
