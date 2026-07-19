import { useState, useMemo } from "react";
import type { CSSProperties } from "react";
import { useTheme } from "../theme/ThemeContext";
import { useStore } from "../store/useStore";
import { getClient, addOperation } from "../store";
import { computeOperationStats } from "@zakhira/core";
import { DateInput } from "../components/FormControls";
import type { Operation } from "@zakhira/core";
import type { ColorTokens } from "@zakhira/ui";

type Priority = "low" | "medium" | "high";
const PRIORITY_VALUE: Record<Priority, number> = { low: 1, medium: 2, high: 3 };

function FieldLabel({ text, required }: { text: string; required?: boolean }) {
  return (
    <span style={{ display: "block", fontSize: 11, color: "#a4a8b0", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>
      {text}{required && <span style={{ color: "#e05555", marginLeft: 2 }}>*</span>}
    </span>
  );
}

function CreateOperationModal({ tokens, onClose }: { tokens: ColorTokens; onClose: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [priority, setPriority] = useState<Priority | "">("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim()) { setError("Name is required."); return; }
    setSaving(true); setError(null);
    try {
      const client = getClient();
      if (!client) throw new Error("Not connected");
      const res = await client.createOperation({
        name: name.trim(),
        description: description.trim() || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        importance: priority !== "" ? PRIORITY_VALUE[priority] : undefined,
      });
      if (!res.ok) { setError(res.error); return; }
      addOperation(res.data);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create operation.");
    } finally { setSaving(false); }
  }

  const inp: CSSProperties = {
    width: "100%", padding: "9px 11px", backgroundColor: tokens.bgInput,
    border: `1px solid ${tokens.border}`, borderRadius: 8, color: tokens.textPrimary,
    fontSize: 14, outline: "none", boxSizing: "border-box",
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ width: 460, backgroundColor: tokens.bgCard, border: `1px solid ${tokens.borderStrong}`, borderRadius: 14, padding: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: tokens.textPrimary }}>New Operation</h2>
          <button onClick={onClose} style={{ color: tokens.textTertiary, fontSize: 20, lineHeight: 1, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={{ display: "block" }}>
            <FieldLabel text="Name" required />
            <input style={inp} autoFocus value={name} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()} placeholder="e.g. Computer Vision, Immigration…" />
          </label>

          <label style={{ display: "block" }}>
            <FieldLabel text="Description" />
            <textarea style={{ ...inp, resize: "vertical", minHeight: 64, fontFamily: "inherit" }}
              value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this operation about?" />
          </label>

          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <FieldLabel text="Start Date" />
              <DateInput value={startDate} onChange={setStartDate} tokens={tokens} />
            </div>
            <div style={{ flex: 1 }}>
              <FieldLabel text="End Date" />
              <DateInput value={endDate} onChange={setEndDate} tokens={tokens} />
            </div>
          </div>

          <div>
            <FieldLabel text="Priority" />
            <div style={{ display: "flex", gap: 8 }}>
              {(["low", "medium", "high"] as Priority[]).map((p) => {
                const active = priority === p;
                const colors: Record<Priority, string> = { low: "#5aa9f0", medium: "#e3a857", high: "#e05555" };
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
        </div>

        {error && <div style={{ color: "#e05555", fontSize: 13, marginTop: 12 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{ padding: "9px 18px", borderRadius: 8, fontSize: 14, fontWeight: 500, border: `1px solid ${tokens.border}`, color: tokens.textSecondary, backgroundColor: tokens.bgSurface, cursor: "pointer" }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: "9px 22px", borderRadius: 8, fontSize: 14, fontWeight: 600, backgroundColor: tokens.accent, color: tokens.accentOn, opacity: saving ? 0.6 : 1, cursor: saving ? "not-allowed" : "pointer" }}>
            {saving ? "Creating…" : "Create Operation"}
          </button>
        </div>
      </div>
    </div>
  );
}

function OperationCard({
  op,
  tasks,
  tokens,
}: {
  op: Operation;
  tasks: ReturnType<typeof useStore>["tasks"];
  tokens: ColorTokens;
}) {
  const opTasks = tasks.filter((t) => t.operationId === op.id);
  const stats = computeOperationStats(opTasks);
  const active = opTasks.filter((t) => t.state !== "completed" && t.state !== "scrapped");
  const progress = stats.totalMain > 0 ? stats.completedMain / stats.totalMain : 0;

  return (
    <div
      style={{
        backgroundColor: tokens.bgCard, border: `1px solid ${tokens.border}`,
        borderRadius: 12, padding: "16px 18px", cursor: "pointer",
        marginBottom: 10, transition: "border-color 0.12s",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: tokens.textPrimary }}>
            {op.isDefault && <span style={{ color: tokens.textTertiary, marginRight: 4 }}>🔒</span>}
            {op.name}
          </div>
          {op.description && (
            <div style={{ fontSize: 13, color: tokens.textSecondary, marginTop: 2 }}>{op.description}</div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {op.importance !== null && (
            <span style={{ color: tokens.accent, fontSize: 13 }}>
              {"★".repeat(Math.min(op.importance, 5))}
            </span>
          )}
          {op.endDate && (
            <span style={{ fontSize: 12, color: tokens.textTertiary }}>{op.endDate}</span>
          )}
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        {op.isDefault ? (
          <span style={{ fontSize: 12, color: tokens.textTertiary }}>
            {active.length} active task{active.length !== 1 ? "s" : ""}
          </span>
        ) : (
          <>
            <div
              style={{
                display: "flex", justifyContent: "space-between",
                fontSize: 12, color: tokens.textTertiary, marginBottom: 6,
              }}
            >
              <span>{stats.completedMain}/{stats.totalMain} main quests complete</span>
              {stats.isComplete && (
                <span style={{ color: tokens.stateCompleted, fontWeight: 600 }}>✓ Complete</span>
              )}
            </div>
            {stats.totalMain > 0 && (
              <div style={{ height: 4, borderRadius: 2, backgroundColor: tokens.border, overflow: "hidden" }}>
                <div
                  style={{
                    height: 4, width: `${Math.round(progress * 100)}%`,
                    backgroundColor: tokens.accent, borderRadius: 2, transition: "width 0.3s",
                  }}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function Operations() {
  const { tokens } = useTheme();
  const store = useStore();
  const [showCreate, setShowCreate] = useState(false);

  const sorted = useMemo(() => {
    const defaults = store.operations.filter((o) => o.isDefault);
    const rest = store.operations.filter((o) => !o.isDefault);
    return [...defaults, ...rest];
  }, [store.operations]);

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div
          style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "14px 24px", borderBottom: `1px solid ${tokens.border}`,
            backgroundColor: tokens.bgSurface, flexShrink: 0,
          }}
        >
          <h1 style={{ fontSize: 20, fontWeight: 700, color: tokens.textPrimary }}>Operations</h1>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              padding: "8px 16px", backgroundColor: tokens.accent,
              color: tokens.accentOn, fontWeight: 600, fontSize: 13,
              borderRadius: 8, cursor: "pointer",
            }}
          >
            + New Operation
          </button>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "24px" }}>
          {sorted.length === 0 && (
            <div style={{ textAlign: "center", marginTop: 60, color: tokens.textTertiary }}>
              No operations yet
            </div>
          )}
          {sorted.map((op) => (
            <OperationCard key={op.id} op={op} tasks={store.tasks} tokens={tokens} />
          ))}
        </div>
      </div>

      {showCreate && (
        <CreateOperationModal tokens={tokens} onClose={() => setShowCreate(false)} />
      )}
    </>
  );
}
