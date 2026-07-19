import { useState, useEffect, useRef, useCallback } from "react";
import type { CSSProperties } from "react";
import { getClient, getStore, updateTaskInStore } from "../store";
import { useStore } from "../store/useStore";
import { canComplete, blockingPrerequisites } from "@zakhira/core";
import { DateInput } from "./FormControls";
import type { Task, TaskType, TaskState, UpdateTaskInput } from "@zakhira/core";
import type { ColorTokens } from "@zakhira/ui";

type Priority = "low" | "medium" | "high";
const PRIORITY_VALUE: Record<Priority, number> = { low: 1, medium: 2, high: 3 };
const VALUE_PRIORITY: Record<number, Priority> = { 1: "low", 2: "medium", 3: "high" };
const PRIORITY_COLOR: Record<Priority, string> = { low: "#5aa9f0", medium: "#e3a857", high: "#e05555" };

const TYPE_ICONS: Record<string, string> = { main: "⚔", side: "📍", exploration: "⚗" };
const TYPE_LABEL: Record<string, string> = { main: "Main Quest", side: "Side Quest", exploration: "Exploration" };
const STATE_LABEL: Record<string, string> = {
  todo: "To-Do", in_progress: "In Progress", blocked: "Blocked",
  completed: "Completed", scrapped: "Scrapped",
};
const ALL_STATES: TaskState[] = ["todo", "in_progress", "blocked", "completed", "scrapped"];

function stateColor(state: string, tokens: ColorTokens): string {
  const m: Record<string, string> = {
    todo: tokens.stateTodo, in_progress: tokens.stateInProgress,
    blocked: tokens.stateBlocked, completed: tokens.stateCompleted, scrapped: tokens.stateScrapped,
  };
  return m[state] ?? tokens.stateTodo;
}
function tierColor(type: string): string {
  return type === "main" ? "#d9a441" : type === "side" ? "#b8bcc0" : "#bd7d4a";
}

// ── Shared picker helpers ─────────────────────────────────────────────────────

function usePicker() {
  const [open, setOpen] = useState(false);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return { open, setOpen, hoverKey, setHoverKey, ref, close: () => setOpen(false) };
}

const Chevron = ({ open }: { open: boolean }) => (
  <span style={{
    fontSize: 9, opacity: 0.6, display: "inline-block",
    transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.18s",
  }}>▾</span>
);

function triggerStyle(color: string, open: boolean): CSSProperties {
  return {
    fontSize: 11, fontWeight: 600, padding: "4px 9px", borderRadius: 6,
    color, backgroundColor: color + "22",
    border: `1px solid ${open ? color + "66" : "transparent"}`,
    cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5,
    boxShadow: open ? `0 0 0 2px ${color}1a` : "none",
    transition: "border-color 0.15s, box-shadow 0.15s",
  };
}
function dropdownStyle(tokens: ColorTokens): CSSProperties {
  return {
    position: "absolute", top: "calc(100% + 6px)", left: 0,
    backgroundColor: tokens.bgCard, border: `1px solid ${tokens.borderStrong}`,
    borderRadius: 10, boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
    zIndex: 500, padding: "4px", minWidth: 172,
  };
}
function itemStyle(isCurrent: boolean, isHovered: boolean, color: string, tokens: ColorTokens): CSSProperties {
  return {
    width: "100%", padding: "8px 11px", textAlign: "left", borderRadius: 7,
    display: "flex", alignItems: "center", gap: 9, cursor: "pointer",
    fontSize: 13, fontWeight: isCurrent ? 600 : 400,
    color: isCurrent ? color : tokens.textPrimary,
    backgroundColor: isCurrent ? color + "18" : isHovered ? tokens.border : "transparent",
    transition: "background-color 0.1s",
  };
}

// ── Badge pickers ─────────────────────────────────────────────────────────────

function StatusPicker({ ct, tokens, onUpdate, busy }: { ct: Task; tokens: ColorTokens; onUpdate: (fields: UpdateTaskInput) => void; busy: boolean }) {
  const p = usePicker();
  const sc = stateColor(ct.state, tokens);
  return (
    <div ref={p.ref} style={{ position: "relative", display: "inline-block" }}>
      <button type="button" disabled={busy} onClick={() => p.setOpen(o => !o)} style={triggerStyle(sc, p.open)}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: sc, display: "inline-block", flexShrink: 0, boxShadow: `0 0 4px ${sc}` }} />
        {STATE_LABEL[ct.state] ?? ct.state}
        <Chevron open={p.open} />
      </button>
      {p.open && (
        <div style={dropdownStyle(tokens)}>
          {ALL_STATES.map(s => {
            const c = stateColor(s, tokens);
            const isCurrent = s === ct.state;
            return (
              <button key={s} type="button"
                onClick={() => { onUpdate({ state: s }); p.close(); }}
                onMouseEnter={() => p.setHoverKey(s)}
                onMouseLeave={() => p.setHoverKey(null)}
                style={itemStyle(isCurrent, p.hoverKey === s, c, tokens)}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, backgroundColor: c, display: "inline-block", boxShadow: isCurrent ? `0 0 6px ${c}99` : "none" }} />
                {STATE_LABEL[s]}
                {isCurrent && <span style={{ marginLeft: "auto", fontSize: 10, color: c }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TypePicker({ ct, tokens, onUpdate, busy }: { ct: Task; tokens: ColorTokens; onUpdate: (fields: UpdateTaskInput) => void; busy: boolean }) {
  const p = usePicker();
  const tc = tierColor(ct.type);
  return (
    <div ref={p.ref} style={{ position: "relative", display: "inline-block" }}>
      <button type="button" disabled={busy} onClick={() => p.setOpen(o => !o)} style={triggerStyle(tc, p.open)}>
        {TYPE_ICONS[ct.type]} {TYPE_LABEL[ct.type]}
        <Chevron open={p.open} />
      </button>
      {p.open && (
        <div style={dropdownStyle(tokens)}>
          {(["main", "side", "exploration"] as TaskType[]).map(t => {
            const c = tierColor(t);
            const isCurrent = t === ct.type;
            return (
              <button key={t} type="button"
                onClick={() => { onUpdate({ type: t }); p.close(); }}
                onMouseEnter={() => p.setHoverKey(t)}
                onMouseLeave={() => p.setHoverKey(null)}
                style={itemStyle(isCurrent, p.hoverKey === t, c, tokens)}
              >
                <span style={{ fontSize: 14, width: 20, flexShrink: 0 }}>{TYPE_ICONS[t]}</span>
                {TYPE_LABEL[t]}
                {isCurrent && <span style={{ marginLeft: "auto", fontSize: 10, color: c }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PriorityPicker({ ct, tokens, onUpdate, busy }: { ct: Task; tokens: ColorTokens; onUpdate: (fields: UpdateTaskInput) => void; busy: boolean }) {
  const p = usePicker();
  const priority = ct.importance !== null ? VALUE_PRIORITY[ct.importance] : null;
  const color = priority ? PRIORITY_COLOR[priority] : tokens.textTertiary;
  const label = priority ? priority.charAt(0).toUpperCase() + priority.slice(1) : "Priority";

  return (
    <div ref={p.ref} style={{ position: "relative", display: "inline-block" }}>
      <button type="button" disabled={busy} onClick={() => p.setOpen(o => !o)} style={{
        ...triggerStyle(color, p.open),
        opacity: priority ? 1 : 0.65,
        backgroundColor: priority ? color + "22" : tokens.border,
        fontStyle: priority ? "normal" : "italic",
      }}>
        {label}
        <Chevron open={p.open} />
      </button>
      {p.open && (
        <div style={dropdownStyle(tokens)}>
          {(["low", "medium", "high"] as Priority[]).map(pr => {
            const c = PRIORITY_COLOR[pr];
            const isCurrent = priority === pr;
            return (
              <button key={pr} type="button"
                onClick={() => { onUpdate({ importance: PRIORITY_VALUE[pr] }); p.close(); }}
                onMouseEnter={() => p.setHoverKey(pr)}
                onMouseLeave={() => p.setHoverKey(null)}
                style={itemStyle(isCurrent, p.hoverKey === pr, c, tokens)}
              >
                <span style={{ width: 8, height: 8, borderRadius: 2, flexShrink: 0, backgroundColor: c, display: "inline-block" }} />
                {pr.charAt(0).toUpperCase() + pr.slice(1)}
                {isCurrent && <span style={{ marginLeft: "auto", fontSize: 10, color: c }}>✓</span>}
              </button>
            );
          })}
          {/* Clear priority */}
          <div style={{ borderTop: `1px solid ${tokens.border}`, margin: "4px 0 0" }} />
          <button type="button"
            onClick={() => { onUpdate({ importance: null }); p.close(); }}
            onMouseEnter={() => p.setHoverKey("none")}
            onMouseLeave={() => p.setHoverKey(null)}
            style={itemStyle(!priority, p.hoverKey === "none", tokens.textTertiary, tokens)}
          >
            <span style={{ width: 8, height: 8, borderRadius: 2, flexShrink: 0, border: `1px solid ${tokens.borderStrong}`, display: "inline-block" }} />
            No priority
            {!priority && <span style={{ marginLeft: "auto", fontSize: 10, color: tokens.textTertiary }}>✓</span>}
          </button>
        </div>
      )}
    </div>
  );
}

function OperationPicker({ ct, tokens, onUpdate, busy }: { ct: Task; tokens: ColorTokens; onUpdate: (fields: UpdateTaskInput) => void; busy: boolean }) {
  const p = usePicker();
  const store = useStore();
  const currentOp = store.operations.find(o => o.id === ct.operationId);
  const color = tokens.textTertiary;

  return (
    <div ref={p.ref} style={{ position: "relative", display: "inline-block" }}>
      <button type="button" disabled={busy} onClick={() => p.setOpen(o => !o)} style={{
        ...triggerStyle(color, p.open),
        backgroundColor: tokens.border,
      }}>
        {currentOp?.name ?? "Unknown"}
        <Chevron open={p.open} />
      </button>
      {p.open && (
        <div style={{ ...dropdownStyle(tokens), minWidth: 200, maxHeight: 200, overflowY: "auto" }}>
          {store.operations.map(op => {
            const isCurrent = op.id === ct.operationId;
            return (
              <button key={op.id} type="button"
                onClick={() => { onUpdate({ operationId: op.id }); p.close(); }}
                onMouseEnter={() => p.setHoverKey(op.id)}
                onMouseLeave={() => p.setHoverKey(null)}
                style={itemStyle(isCurrent, p.hoverKey === op.id, tokens.accent, tokens)}
              >
                {isCurrent
                  ? <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: tokens.accent, display: "inline-block", flexShrink: 0 }} />
                  : <span style={{ width: 8, height: 8, display: "inline-block", flexShrink: 0 }} />
                }
                {op.name}
                {isCurrent && <span style={{ marginLeft: "auto", fontSize: 10, color: tokens.accent }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Time helpers ─────────────────────────────────────────────────────────────

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (!parts.length || sec) parts.push(`${sec}s`);
  return parts.join(" ");
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flexShrink: 0 }}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
    <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
  </svg>
);

// ── TaskModal ─────────────────────────────────────────────────────────────────

interface Props {
  task: Task;
  allTasksInOp: Task[];
  opName: string;
  tokens: ColorTokens;
  onClose: () => void;
}

export function TaskModal({ task, allTasksInOp, opName, tokens, onClose }: Props) {
  const [ct, setCt] = useState(task);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"scrap" | null>(null);

  // Edit state (initialised from task prop)
  const [editTitle, setEditTitle] = useState(task.title);
  const [editType, setEditType] = useState<TaskType>(task.type);
  const [editPriority, setEditPriority] = useState<Priority | "">(
    task.importance !== null ? (VALUE_PRIORITY[task.importance] ?? "") : ""
  );
  const [editNotes, setEditNotes] = useState(task.notes ?? "");
  const [editEndDate, setEditEndDate] = useState(task.endDate ?? "");

  // ── Timer ────────────────────────────────────────────────────────────────────
  const [timerRunning, setTimerRunning] = useState(false);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  // Locks the display during async save so there's no flash to 0
  const [lockedTotal, setLockedTotal] = useState<number | null>(null);
  const sessionStartRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);

  const displaySeconds = lockedTotal !== null ? lockedTotal : ct.timeLogged + sessionSeconds;

  function handleTimerStart() {
    if (timerRunning) return;
    sessionStartRef.current = Date.now() - sessionSeconds * 1000;
    setTimerRunning(true);
    intervalRef.current = window.setInterval(() => {
      setSessionSeconds(Math.floor((Date.now() - sessionStartRef.current!) / 1000));
    }, 1000);
  }

  const handleTimerStop = useCallback(async () => {
    if (!timerRunning) return;
    window.clearInterval(intervalRef.current!);
    setTimerRunning(false);
    const total = ct.timeLogged + sessionSeconds;
    setLockedTotal(total); // freeze display during save
    setSessionSeconds(0);
    await updateField({ timeLogged: total });
    setLockedTotal(null); // release — ct.timeLogged is now total
  }, [timerRunning, ct.timeLogged, sessionSeconds]);

  async function handleTimerReset() {
    window.clearInterval(intervalRef.current!);
    setTimerRunning(false);
    setSessionSeconds(0);
    setLockedTotal(null);
    sessionStartRef.current = null;
    await updateField({ timeLogged: 0 });
  }

  useEffect(() => {
    return () => { if (intervalRef.current) window.clearInterval(intervalRef.current); };
  }, []);

  const isDone = ct.state === "completed" || ct.state === "scrapped";
  const blocking = blockingPrerequisites(ct, allTasksInOp);
  const completable = canComplete(ct, allTasksInOp);
  const priority = ct.importance !== null ? VALUE_PRIORITY[ct.importance] : null;
  const prereqTasks = ct.prerequisites.map(id => allTasksInOp.find(t => t.id === id)).filter(Boolean) as Task[];

  // Escape: dismiss confirm → exit edit → close modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault(); e.stopPropagation();
      if (confirm) { setConfirm(null); return; }
      if (mode === "edit") { setMode("view"); setError(null); return; }
      onClose();
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [confirm, mode, onClose]);

  // Update fields without closing (for badge pickers)
  async function updateField(fields: UpdateTaskInput) {
    setBusy(true); setError(null);
    try {
      const client = getClient();
      if (!client) throw new Error("Not connected");
      const store = getStore();
      console.log("[updateField] PATCH", `${store.apiUrl}/tasks/${ct.id}`, fields);
      const res = await client.updateTask(ct.id, fields);
      console.log("[updateField] response ok:", res.ok, res);
      if (!res.ok) { setError(res.error); return; }
      setCt(res.data);
      updateTaskInStore(res.data);
    } catch (e) {
      console.error("[updateField] CATCH:", e);
      setError(e instanceof Error ? e.message : "Failed");
    } finally { setBusy(false); }
  }

  // Transition to state AND close (Complete button, Scrap confirm)
  async function transitionAndClose(state: TaskState) {
    setBusy(true); setError(null);
    try {
      const client = getClient();
      if (!client) throw new Error("Not connected");
      const res = await client.updateTask(ct.id, { state });
      if (!res.ok) { setError(res.error); return; }
      updateTaskInStore(res.data);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally { setBusy(false); }
  }

  async function saveEdit() {
    if (!editTitle.trim()) { setError("Title is required."); return; }
    setBusy(true); setError(null);
    try {
      const client = getClient();
      if (!client) throw new Error("Not connected");
      const res = await client.updateTask(ct.id, {
        title: editTitle.trim(), type: editType,
        importance: editPriority !== "" ? PRIORITY_VALUE[editPriority] : null,
        notes: editNotes.trim() || null, endDate: editEndDate || null,
      });
      if (!res.ok) { setError(res.error); return; }
      setCt(res.data);
      updateTaskInStore(res.data);
      setMode("view");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    } finally { setBusy(false); }
  }

  const inp: CSSProperties = {
    width: "100%", padding: "9px 11px", backgroundColor: tokens.bgInput,
    border: `1px solid ${tokens.borderStrong}`, borderRadius: 8, color: tokens.textPrimary,
    fontSize: 14, outline: "none", boxSizing: "border-box",
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: 660, minHeight: "50vh", maxHeight: "90vh", display: "flex", flexDirection: "column",
        background: `linear-gradient(145deg, ${tokens.bgCard} 65%, ${tierColor(ct.type)}0e 100%)`,
        border: `1.5px solid ${tierColor(ct.type)}55`,
        borderRadius: 16, overflow: "hidden",
      }}>
        {/* ── Header ── */}
        <div style={{
          padding: "22px 28px 16px", flexShrink: 0,
          background: `linear-gradient(135deg, ${tokens.bgSurface} 55%, ${tierColor(ct.type)}12 100%)`,
          borderBottom: `1px solid ${tierColor(ct.type)}28`,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{TYPE_ICONS[ct.type]}</span>
              {mode === "view" ? (
                <h2 style={{ fontSize: 17, fontWeight: 700, color: tokens.textPrimary, margin: 0, lineHeight: 1.3 }}>{ct.title}</h2>
              ) : (
                <input style={{ ...inp, fontSize: 16, fontWeight: 700, flex: 1 }} value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)} autoFocus />
              )}
            </div>
            <button onClick={onClose} style={{ color: tokens.textTertiary, fontSize: 22, lineHeight: 1, cursor: "pointer", marginLeft: 12, flexShrink: 0 }}>×</button>
          </div>

          {/* Inline badge pickers */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10, alignItems: "center" }}>
            <StatusPicker ct={ct} tokens={tokens} onUpdate={updateField} busy={busy} />
            <TypePicker ct={ct} tokens={tokens} onUpdate={updateField} busy={busy} />
            <PriorityPicker ct={ct} tokens={tokens} onUpdate={updateField} busy={busy} />
            <OperationPicker ct={ct} tokens={tokens} onUpdate={updateField} busy={busy} />
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px", backgroundColor: tokens.bgPage }}>
          {mode === "view" ? (
            <>
              {(ct.startDate || ct.endDate) && (
                <div style={{ display: "flex", gap: 20, marginBottom: 14 }}>
                  {ct.startDate && (
                    <div>
                      <div style={{ fontSize: 10, color: tokens.textTertiary, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Start</div>
                      <div style={{ fontSize: 13, color: tokens.textSecondary }}>{ct.startDate}</div>
                    </div>
                  )}
                  {ct.endDate && (
                    <div>
                      <div style={{ fontSize: 10, color: tokens.textTertiary, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Due</div>
                      <div style={{ fontSize: 13, color: tokens.textSecondary }}>{ct.endDate}</div>
                    </div>
                  )}
                </div>
              )}

              {prereqTasks.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, color: tokens.textTertiary, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Prerequisites</div>
                  {prereqTasks.map((p) => (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: stateColor(p.state, tokens), display: "inline-block", flexShrink: 0 }} />
                      <span style={{ fontSize: 13, color: tokens.textSecondary }}>{p.title}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Time Logged ── */}
              <div style={{
                marginBottom: 16, padding: "14px 16px",
                backgroundColor: tokens.bgCard, borderRadius: 10,
                border: `1px solid ${tokens.border}`,
              }}>
                <div style={{ fontSize: 10, color: tokens.textTertiary, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                  Time Logged
                </div>
                <div style={{
                  fontSize: 30, fontWeight: 800, color: timerRunning ? tokens.accent : tokens.textPrimary,
                  fontFamily: "system-ui, monospace", letterSpacing: "-0.03em", marginBottom: 12,
                  transition: "color 0.2s",
                }}>
                  {formatTime(displaySeconds)}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={timerRunning ? handleTimerStop : handleTimerStart}
                    disabled={isDone || busy}
                    style={{
                      padding: "7px 16px", borderRadius: 7, fontSize: 13, fontWeight: 600,
                      cursor: isDone || busy ? "not-allowed" : "pointer",
                      border: "none", opacity: isDone ? 0.4 : 1,
                      backgroundColor: timerRunning ? "#b80000" : "#015D0A",
                      boxShadow: timerRunning ? "0 3px 10px rgba(184,0,0,0.4)" : "0 3px 10px rgba(1,93,10,0.4)",
                      color: "#fff",
                    }}
                  >
                    {timerRunning ? "⏹ Stop" : "▶ Start"}
                  </button>
                  <button
                    onClick={handleTimerReset}
                    disabled={isDone || busy || (displaySeconds === 0 && !timerRunning)}
                    style={{
                      padding: "7px 14px", borderRadius: 7, fontSize: 13, fontWeight: 500,
                      cursor: "pointer", border: `1px solid ${tokens.border}`,
                      color: tokens.textSecondary, backgroundColor: tokens.bgSurface,
                      opacity: (isDone || (displaySeconds === 0 && !timerRunning)) ? 0.4 : 1,
                    }}
                  >
                    ↺ Reset
                  </button>
                </div>
              </div>

              {ct.notes && (
                <div>
                  <div style={{ fontSize: 10, color: tokens.textTertiary, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Notes</div>
                  <p style={{ fontSize: 14, color: tokens.textSecondary, lineHeight: 1.6, whiteSpace: "pre-wrap", margin: 0 }}>{ct.notes}</p>
                </div>
              )}

              {!ct.notes && prereqTasks.length === 0 && !ct.startDate && !ct.endDate && (
                <p style={{ color: tokens.textTertiary, fontSize: 13 }}>No additional details.</p>
              )}
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <span style={{ display: "block", fontSize: 11, color: "#a4a8b0", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>Type</span>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["main", "side", "exploration"] as TaskType[]).map((t) => (
                    <button key={t} onClick={() => setEditType(t)} style={{
                      flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer",
                      border: `1px solid ${editType === t ? tierColor(t) : tokens.border}`,
                      backgroundColor: editType === t ? tierColor(t) + "22" : tokens.bgInput,
                      color: editType === t ? tierColor(t) : tokens.textSecondary,
                    }}>
                      {TYPE_ICONS[t]} {t === "main" ? "Main" : t === "side" ? "Side" : "Explore"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span style={{ display: "block", fontSize: 11, color: "#a4a8b0", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>Priority</span>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["low", "medium", "high"] as Priority[]).map((p) => {
                    const active = editPriority === p;
                    return (
                      <button key={p} onClick={() => setEditPriority(active ? "" : p)} style={{
                        flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer",
                        border: `1px solid ${active ? PRIORITY_COLOR[p] : tokens.border}`,
                        backgroundColor: active ? PRIORITY_COLOR[p]! + "22" : tokens.bgInput,
                        color: active ? PRIORITY_COLOR[p] : tokens.textSecondary,
                      }}>
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <span style={{ display: "block", fontSize: 11, color: "#a4a8b0", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>Due Date</span>
                <DateInput value={editEndDate} onChange={setEditEndDate} tokens={tokens} />
              </div>

              <label style={{ display: "block" }}>
                <span style={{ display: "block", fontSize: 11, color: "#a4a8b0", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>Notes</span>
                <textarea style={{ ...inp, resize: "vertical", minHeight: 96, fontFamily: "inherit" }}
                  value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Add notes…" />
              </label>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{ padding: "16px 28px", flexShrink: 0, backgroundColor: tokens.bgSurface, borderTop: `1px solid ${tierColor(ct.type)}33` }}>
          {error && <div style={{ color: "#e05555", fontSize: 12, marginBottom: 10 }}>{error}</div>}

          {!blocking.length && !completable && !isDone && (
            <div style={{ fontSize: 12, color: tokens.textTertiary, marginBottom: 8 }}>
              Finish prerequisites first to complete this task.
            </div>
          )}
          {blocking.length > 0 && (
            <div style={{ fontSize: 12, color: tokens.stateBlocked, marginBottom: 8 }}>
              Blocked by: {blocking.map((b) => b.title).join(", ")}
            </div>
          )}

          {confirm === "scrap" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 13, color: tokens.textSecondary, flex: 1 }}>Scrap this task?</span>
              <button onClick={() => setConfirm(null)} style={{ padding: "7px 14px", borderRadius: 7, border: `1px solid ${tokens.border}`, color: tokens.textSecondary, backgroundColor: tokens.bgSurface, cursor: "pointer", fontSize: 13 }}>Cancel</button>
              <button onClick={() => transitionAndClose("scrapped")} disabled={busy} style={{
                padding: "7px 18px", borderRadius: 7, fontWeight: 600, fontSize: 13, cursor: "pointer", opacity: busy ? 0.6 : 1,
                backgroundColor: "#b80000", color: "#fff", border: "none",
                boxShadow: "0 4px 14px rgba(184, 0, 0, 0.45)",
              }}>Confirm Scrap</button>
            </div>
          ) : mode === "view" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {!isDone && (
                <button
                  onClick={() => transitionAndClose("completed")}
                  disabled={!completable || busy}
                  title={!completable ? "Finish prerequisites first" : ""}
                  style={{
                    padding: "10px 22px", borderRadius: 9, fontSize: 13, fontWeight: 700,
                    cursor: completable ? "pointer" : "not-allowed",
                    backgroundColor: completable ? "#015D0A" : tokens.border,
                    boxShadow: completable ? "0 4px 16px rgba(1, 93, 10, 0.5)" : "none",
                    color: completable ? "#fff" : tokens.textTertiary,
                    opacity: busy ? 0.6 : 1, border: "none",
                  }}
                >
                  Mark as Complete
                </button>
              )}

              {!isDone && (
                <button onClick={() => setMode("edit")} style={{
                  padding: "10px 20px", borderRadius: 9, fontSize: 13, fontWeight: 500,
                  cursor: "pointer", border: `1px solid ${tokens.borderStrong}`,
                  color: tokens.textSecondary, backgroundColor: tokens.bgCard,
                }}>
                  Edit
                </button>
              )}

              {isDone && (
                <span style={{ color: tokens.textTertiary, fontSize: 13 }}>
                  This task is {STATE_LABEL[ct.state] ?? ct.state}.
                </span>
              )}

              {!isDone && (
                <button onClick={() => setConfirm("scrap")} style={{
                  marginLeft: "auto", padding: "10px 20px", borderRadius: 9,
                  fontSize: 13, fontWeight: 600, cursor: "pointer",
                  backgroundColor: "#b80000", color: "#fff", border: "none",
                  boxShadow: "0 4px 14px rgba(184, 0, 0, 0.4)",
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                  <TrashIcon /> Scrap
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => { setMode("view"); setError(null); }} style={{ padding: "10px 20px", borderRadius: 8, fontSize: 14, fontWeight: 500, border: `1px solid ${tokens.border}`, color: tokens.textSecondary, backgroundColor: tokens.bgSurface, cursor: "pointer" }}>Cancel</button>
              <button onClick={saveEdit} disabled={busy} style={{
                padding: "10px 24px", borderRadius: 8, fontSize: 14, fontWeight: 600,
                background: `linear-gradient(145deg, ${tokens.accent} 0%, #b8862e 100%)`,
                boxShadow: `0 4px 14px rgba(217, 164, 65, 0.4)`,
                color: tokens.accentOn, opacity: busy ? 0.6 : 1,
                cursor: busy ? "not-allowed" : "pointer", border: "none",
              }}>
                {busy ? "Saving…" : "Save Changes"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
