import { useState } from "react";
import type { CSSProperties } from "react";
import { useTheme } from "../theme/ThemeContext";
import { useStore } from "../store/useStore";
import { getClient, addReminder } from "../store";
import { CustomSelect, DateInput } from "../components/FormControls";
import type { Reminder, Recurrence } from "@zakhira/core";
import type { ColorTokens } from "@zakhira/ui";

const RECURRENCE_LABEL: Record<string, string> = { once: "Once", daily: "Daily", yearly: "Yearly" };

function FieldLabel({ text, required }: { text: string; required?: boolean }) {
  return (
    <span style={{ display: "block", fontSize: 11, color: "#a4a8b0", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>
      {text}{required && <span style={{ color: "#e05555", marginLeft: 2 }}>*</span>}
    </span>
  );
}

function CreateReminderModal({ tokens, onClose }: { tokens: ColorTokens; onClose: () => void }) {
  const store = useStore();
  const [title, setTitle] = useState("");
  const [fireHour, setFireHour] = useState<number>(9);
  const [recurrence, setRecurrence] = useState<Recurrence>("once");
  const [fireDate, setFireDate] = useState("");
  const [taskId, setTaskId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!title.trim()) { setError("Title is required."); return; }
    if (fireHour < 0 || fireHour > 23) { setError("Hour must be 0–23."); return; }
    setSaving(true); setError(null);
    try {
      const client = getClient();
      if (!client) throw new Error("Not connected");
      const res = await client.createReminder({
        title: title.trim(),
        fireHour: Math.floor(fireHour),
        recurrence,
        fireDate: (recurrence === "once" || recurrence === "yearly") && fireDate ? fireDate : undefined,
        taskId: taskId || undefined,
      });
      if (!res.ok) { setError(res.error); return; }
      addReminder(res.data);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create reminder.");
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
      <div style={{ width: 440, backgroundColor: tokens.bgCard, border: `1px solid ${tokens.borderStrong}`, borderRadius: 14, padding: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: tokens.textPrimary }}>New Reminder</h2>
          <button onClick={onClose} style={{ color: tokens.textTertiary, fontSize: 20, lineHeight: 1, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={{ display: "block" }}>
            <FieldLabel text="Title" required />
            <input style={inp} autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()} placeholder="e.g. Take medication, Birthday…" />
          </label>

          <div style={{ display: "flex", gap: 12 }}>
            <label style={{ display: "block", flex: 1 }}>
              <FieldLabel text="Hour (0–23)" required />
              <input style={inp} type="number" min={0} max={23} value={fireHour}
                onChange={(e) => setFireHour(Number(e.target.value))} placeholder="9" />
            </label>
            <div style={{ flex: 1 }}>
              <FieldLabel text="Recurrence" required />
              <CustomSelect
                value={recurrence}
                onChange={(v) => setRecurrence(v as Recurrence)}
                options={[
                  { value: "once", label: "Once" },
                  { value: "daily", label: "Daily" },
                  { value: "yearly", label: "Yearly" },
                ]}
                tokens={tokens}
              />
            </div>
          </div>

          {(recurrence === "once" || recurrence === "yearly") && (
            <div>
              <FieldLabel text={recurrence === "yearly" ? "Date (month/day anchor)" : "Date"} />
              <DateInput value={fireDate} onChange={setFireDate} tokens={tokens} />
            </div>
          )}

          <div>
            <FieldLabel text="Link to Task (optional)" />
            <CustomSelect
              value={taskId}
              onChange={setTaskId}
              placeholder="— Standalone reminder —"
              options={[
                { value: "", label: "— Standalone reminder —" },
                ...store.tasks
                  .filter((t) => t.state !== "completed" && t.state !== "scrapped")
                  .map((t) => ({ value: t.id, label: t.title })),
              ]}
              tokens={tokens}
            />
          </div>
        </div>

        {error && <div style={{ color: "#e05555", fontSize: 13, marginTop: 12 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{ padding: "9px 18px", borderRadius: 8, fontSize: 14, fontWeight: 500, border: `1px solid ${tokens.border}`, color: tokens.textSecondary, backgroundColor: tokens.bgSurface, cursor: "pointer" }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: "9px 22px", borderRadius: 8, fontSize: 14, fontWeight: 600, backgroundColor: tokens.accent, color: tokens.accentOn, opacity: saving ? 0.6 : 1, cursor: saving ? "not-allowed" : "pointer" }}>
            {saving ? "Creating…" : "Create Reminder"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReminderRow({ reminder, tokens }: { reminder: Reminder; tokens: ColorTokens }) {
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "12px 14px", backgroundColor: tokens.bgCard, border: `1px solid ${tokens.border}`, borderRadius: 10, marginBottom: 8, cursor: "pointer" }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: tokens.textPrimary }}>{reminder.title}</div>
        <div style={{ fontSize: 12, color: tokens.textTertiary, marginTop: 2 }}>
          {reminder.fireHour}:00 · {RECURRENCE_LABEL[reminder.recurrence] ?? reminder.recurrence}
          {reminder.fireDate ? ` · ${reminder.fireDate}` : ""}
        </div>
      </div>
      {reminder.snoozedUntil && <span style={{ fontSize: 12, color: tokens.stateBlocked }}>Snoozed</span>}
    </div>
  );
}

export function RemindersScreen() {
  const { tokens } = useTheme();
  const store = useStore();
  const [showCreate, setShowCreate] = useState(false);

  const standalone = store.reminders.filter((r) => r.taskId === null);
  const taskLinked = store.reminders.filter((r) => r.taskId !== null);

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 24px", borderBottom: `1px solid ${tokens.border}`, backgroundColor: tokens.bgSurface, flexShrink: 0 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: tokens.textPrimary }}>Reminders</h1>
          <button onClick={() => setShowCreate(true)} style={{ padding: "8px 16px", backgroundColor: tokens.accent, color: tokens.accentOn, fontWeight: 600, fontSize: 13, borderRadius: 8, cursor: "pointer" }}>
            + New Reminder
          </button>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "24px" }}>
          {store.reminders.length === 0 && (
            <div style={{ textAlign: "center", marginTop: 60, color: tokens.textTertiary }}>
              <div style={{ marginBottom: 8 }}>No reminders yet</div>
              <button onClick={() => setShowCreate(true)} style={{ padding: "9px 20px", backgroundColor: tokens.accent, color: tokens.accentOn, fontWeight: 600, fontSize: 14, borderRadius: 8, cursor: "pointer" }}>
                + New Reminder
              </button>
            </div>
          )}
          {standalone.length > 0 && (
            <section style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 11, fontWeight: 600, color: tokens.textSecondary, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Standalone</h2>
              {standalone.map((r) => <ReminderRow key={r.id} reminder={r} tokens={tokens} />)}
            </section>
          )}
          {taskLinked.length > 0 && (
            <section>
              <h2 style={{ fontSize: 11, fontWeight: 600, color: tokens.textSecondary, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Task Reminders</h2>
              {taskLinked.map((r) => <ReminderRow key={r.id} reminder={r} tokens={tokens} />)}
            </section>
          )}
        </div>
      </div>

      {showCreate && <CreateReminderModal tokens={tokens} onClose={() => setShowCreate(false)} />}
    </>
  );
}
