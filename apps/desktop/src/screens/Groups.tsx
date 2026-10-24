import { useState, useMemo } from "react";
import type { CSSProperties } from "react";
import { useTheme } from "../theme/ThemeContext";
import { useStore } from "../store/useStore";
import {
  getClient,
  addGroup,
  updateGroupInStore,
  removeGroupFromStore,
  sync,
} from "../store";
import {
  computeGroupStats,
  splitTasksForDisplay,
  buildGroupTree,
  wouldCreateGroupCycle,
  groupSubtreeIds,
} from "@zakhira/core";
import type { GroupNode } from "@zakhira/core";
import { DateInput } from "../components/FormControls";
import { TaskModal } from "../components/TaskModal";
import type { Group, Task } from "@zakhira/core";
import type { ColorTokens } from "@zakhira/ui";

type Priority = "low" | "medium" | "high";
const PRIORITY_VALUE: Record<Priority, number> = { low: 1, medium: 2, high: 3 };

/** Indent per nesting level, in px. */
const INDENT = 22;

// ── Task list pieces ──────────────────────────────────────────────────────────

/** A single task row. Finished tasks render dimmed so the eye skips them. */
function TaskRow({ task, tokens, onClick, dimmed }: {
  task: Task; tokens: ColorTokens; onClick: () => void; dimmed?: boolean;
}) {
  const stateColor = STATE_COLOR[task.state] ?? tokens.textTertiary;
  return (
    <div
      onClick={onClick}
      style={{
        padding: "10px 14px", marginBottom: 8,
        backgroundColor: tokens.bgSurface,
        border: `1px solid ${tokens.border}`,
        borderRadius: 10, cursor: "pointer",
        transition: "border-color 0.12s, opacity 0.12s",
        opacity: dimmed ? 0.55 : 1,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = tokens.accent;
        e.currentTarget.style.opacity = "1";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = tokens.border;
        e.currentTarget.style.opacity = dimmed ? "0.55" : "1";
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{
          fontSize: 14, fontWeight: 500, color: tokens.textPrimary,
          textDecoration: task.state === "completed" ? "line-through" : "none",
        }}>
          {task.title}
        </div>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
          color: stateColor, backgroundColor: stateColor + "22",
          textTransform: "capitalize", whiteSpace: "nowrap",
        }}>
          {task.state.replace("_", " ")}
        </span>
      </div>
      {task.notes && (
        <div style={{ fontSize: 12, color: tokens.textSecondary, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {task.notes}
        </div>
      )}
    </div>
  );
}

/** Rule with a centred "Completed" label, separating open work from finished. */
function CompletedDivider({ tokens, count }: { tokens: ColorTokens; count: number }) {
  const line: CSSProperties = { flex: 1, height: 1, backgroundColor: tokens.border };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0 12px" }}>
      <div style={line} />
      <span style={{
        fontSize: 11, fontWeight: 600, textTransform: "uppercase",
        letterSpacing: "0.06em", color: tokens.textTertiary, whiteSpace: "nowrap",
      }}>
        Completed {count > 0 && <span style={{ fontWeight: 400 }}>{count}</span>}
      </span>
      <div style={line} />
    </div>
  );
}

function FieldLabel({ text, required }: { text: string; required?: boolean }) {
  return (
    <span style={{ display: "block", fontSize: 11, color: "#a4a8b0", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>
      {text}{required && <span style={{ color: "#e05555", marginLeft: 2 }}>*</span>}
    </span>
  );
}

/**
 * Groups that may legally parent `group`, as indented options.
 *
 * Excluded: the group itself and its descendants (that is the re-parent cycle
 * the backend rejects), and General Tasks, which stays a flat inbox. Passing
 * `null` for `group` means "a new group", which has no descendants yet.
 */
function parentOptions(
  group: Group | null,
  groups: Group[]
): { value: string; label: string }[] {
  const flatten = (nodes: GroupNode[]): { value: string; label: string }[] =>
    nodes.flatMap((node) => {
      const self = group !== null && node.group.id === group.id;
      const cyclic = group !== null && wouldCreateGroupCycle(group.id, node.group.id, groups);
      const rows = node.group.isDefault || self || cyclic
        ? []
        : [{
            value: node.group.id,
            label: `${"  ".repeat(node.depth)}${node.group.name}`,
          }];
      return [...rows, ...flatten(node.children)];
    });
  return flatten(buildGroupTree(groups));
}

function Select({ value, onChange, options, tokens, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  tokens: ColorTokens;
  placeholder: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: "100%", padding: "9px 11px", backgroundColor: tokens.bgInput,
        border: `1px solid ${tokens.border}`, borderRadius: 8,
        color: tokens.textPrimary, fontSize: 14, outline: "none",
        boxSizing: "border-box", cursor: "pointer",
      }}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

/**
 * Create a group. `initialParentId` pre-selects the parent, so "+ Subgroup" on
 * a row lands the new group in the right place without a second step.
 */
function CreateGroupModal({ tokens, groups, initialParentId, onClose }: {
  tokens: ColorTokens;
  groups: Group[];
  initialParentId: string | null;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [parentId, setParentId] = useState(initialParentId ?? "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [priority, setPriority] = useState<Priority | "">("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = useMemo(() => parentOptions(null, groups), [groups]);

  async function handleSave() {
    if (!name.trim()) { setError("Name is required."); return; }
    setSaving(true); setError(null);
    try {
      const client = getClient();
      if (!client) throw new Error("Not connected");
      const res = await client.createGroup({
        name: name.trim(),
        ...(description.trim() && { description: description.trim() }),
        ...(parentId && { parentId }),
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
        ...(priority !== "" && { importance: PRIORITY_VALUE[priority] }),
      });
      if (!res.ok) { setError(res.error); return; }
      addGroup(res.data);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create group.");
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
          <h2 style={{ fontSize: 17, fontWeight: 700, color: tokens.textPrimary }}>New Group</h2>
          <button onClick={onClose} style={{ color: tokens.textTertiary, fontSize: 20, lineHeight: 1, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={{ display: "block" }}>
            <FieldLabel text="Name" required />
            <input style={inp} autoFocus value={name} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()} placeholder="e.g. Computer Vision, Immigration…" />
          </label>

          <label style={{ display: "block" }}>
            <FieldLabel text="Parent Group" />
            <Select
              value={parentId}
              onChange={setParentId}
              options={options}
              tokens={tokens}
              placeholder="None — top level"
            />
          </label>

          <label style={{ display: "block" }}>
            <FieldLabel text="Description" />
            <textarea style={{ ...inp, resize: "vertical", minHeight: 64, fontFamily: "inherit" }}
              value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this group about?" />
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
            {saving ? "Creating…" : "Create Group"}
          </button>
        </div>
      </div>
    </div>
  );
}

const STATE_COLOR: Record<string, string> = {
  todo: "#a4a8b0",
  in_progress: "#5aa9f0",
  blocked: "#e3a857",
  completed: "#4caf7d",
  scrapped: "#888",
};

/**
 * Confirm deleting a group, naming exactly what each strategy will do to the
 * subtree. The counts come from the real subtree, not just direct children —
 * "delete everything" must say how much everything is.
 */
function DeleteGroupModal({ group, groups, tasks, tokens, onClose, onDeleted }: {
  group: Group;
  groups: Group[];
  tasks: Task[];
  tokens: ColorTokens;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Same subtree walk the backend's cascade uses, so the counts shown here are
  // the counts that will actually be deleted.
  const subtreeIds = useMemo(
    () => new Set(groupSubtreeIds(group.id, groups)),
    [groups, group.id]
  );

  const subgroupCount = subtreeIds.size - 1;
  const subtreeTaskCount = tasks.filter((t) => subtreeIds.has(t.groupId)).length;
  const directTaskCount = tasks.filter((t) => t.groupId === group.id).length;
  const parentName = group.parentId
    ? (groups.find((g) => g.id === group.parentId)?.name ?? "its parent")
    : "the top level";

  async function run(strategy: "move" | "cascade") {
    setBusy(true); setError(null);
    try {
      const client = getClient();
      if (!client) throw new Error("Not connected");
      const res = await client.deleteGroup(group.id, strategy);
      if (!res.ok) { setError(res.error); return; }
      removeGroupFromStore(group.id);
      // The server moved tasks and re-parented sub-groups; re-sync so the tree
      // and every task's groupId reflect that rather than our local guess.
      await sync();
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete group.");
    } finally { setBusy(false); }
  }

  const btn: CSSProperties = {
    width: "100%", textAlign: "left", padding: "12px 14px", borderRadius: 10,
    border: `1px solid ${tokens.border}`, backgroundColor: tokens.bgSurface,
    cursor: busy ? "not-allowed" : "pointer", marginBottom: 10,
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 120 }}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div style={{ width: 470, backgroundColor: tokens.bgCard, border: `1px solid ${tokens.borderStrong}`, borderRadius: 14, padding: 26 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: tokens.textPrimary, marginBottom: 6 }}>
          Delete “{group.name}”?
        </h2>
        <div style={{ fontSize: 13, color: tokens.textSecondary, marginBottom: 18 }}>
          {subgroupCount > 0
            ? `${subgroupCount} sub-group${subgroupCount !== 1 ? "s" : ""} and ${subtreeTaskCount} task${subtreeTaskCount !== 1 ? "s" : ""} sit inside it.`
            : `${directTaskCount} task${directTaskCount !== 1 ? "s" : ""} sit inside it.`}
        </div>

        <button style={btn} disabled={busy} onClick={() => run("move")}>
          <div style={{ fontSize: 14, fontWeight: 600, color: tokens.textPrimary }}>Keep the contents</div>
          <div style={{ fontSize: 12, color: tokens.textSecondary, marginTop: 3 }}>
            Its {directTaskCount} task{directTaskCount !== 1 ? "s" : ""} move to General Tasks
            {subgroupCount > 0 && `, and its sub-groups move up to ${parentName}`}.
            Prerequisites on the moved tasks are cleared.
          </div>
        </button>

        <button style={btn} disabled={busy} onClick={() => run("cascade")}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#e05555" }}>Delete everything inside</div>
          <div style={{ fontSize: 12, color: tokens.textSecondary, marginTop: 3 }}>
            Permanently deletes this group
            {subgroupCount > 0 && `, its ${subgroupCount} sub-group${subgroupCount !== 1 ? "s" : ""}`}
            {" "}and all {subtreeTaskCount} task{subtreeTaskCount !== 1 ? "s" : ""} within. Cannot be undone.
          </div>
        </button>

        {error && <div style={{ color: "#e05555", fontSize: 13, marginTop: 8 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <button onClick={onClose} disabled={busy} style={{ padding: "9px 18px", borderRadius: 8, fontSize: 14, fontWeight: 500, border: `1px solid ${tokens.border}`, color: tokens.textSecondary, backgroundColor: tokens.bgSurface, cursor: "pointer" }}>
            {busy ? "Working…" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Slide-over for one group: its own tasks, its sub-groups as navigable rows,
 * and the group-level actions (add a sub-group, move, delete).
 *
 * Tasks listed here are the group's *direct* tasks only. Prerequisites are
 * same-group scoped, so this list is also exactly the set a task in this group
 * can be blocked by — which is why it is what gets handed to TaskModal.
 */
function GroupTasksPanel({ group, groups, tasks, tokens, onClose, onOpenGroup, onAddSubgroup }: {
  group: Group;
  groups: Group[];
  tasks: Task[];
  tokens: ColorTokens;
  onClose: () => void;
  onOpenGroup: (g: Group) => void;
  onAddSubgroup: (parentId: string) => void;
}) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  const groupTasks = tasks.filter((t) => t.groupId === group.id);
  const { active, done } = splitTasksForDisplay(groupTasks);
  const children = groups
    .filter((g) => g.parentId === group.id)
    .sort((a, b) => a.name.localeCompare(b.name));
  const stats = computeGroupStats(group.id, groups, tasks);
  const moveTargets = useMemo(() => parentOptions(group, groups), [group, groups]);

  async function move(parentId: string) {
    setMoveError(null);
    try {
      const client = getClient();
      if (!client) throw new Error("Not connected");
      const res = await client.updateGroup(group.id, { parentId: parentId || null });
      if (!res.ok) { setMoveError(res.error); return; }
      updateGroupInStore(res.data);
    } catch (e) {
      setMoveError(e instanceof Error ? e.message : "Failed to move group.");
    }
  }

  return (
    <>
      <div
        style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 90 }}
        onClick={onClose}
      />
      <div
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0, width: 480,
          backgroundColor: tokens.bgCard, borderLeft: `1px solid ${tokens.border}`,
          zIndex: 91, display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ padding: "18px 22px 14px", borderBottom: `1px solid ${tokens.border}`, flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: tokens.textPrimary }}>{group.name}</div>
              {group.description && (
                <div style={{ fontSize: 13, color: tokens.textSecondary, marginTop: 2 }}>{group.description}</div>
              )}
            </div>
            <button onClick={onClose} style={{ color: tokens.textTertiary, fontSize: 22, cursor: "pointer", lineHeight: 1, marginLeft: 12 }}>×</button>
          </div>
          <div style={{ fontSize: 12, color: tokens.textTertiary, marginTop: 8 }}>
            {active.length} active · {done.length} done · {groupTasks.length} here
            {children.length > 0 && ` · ${children.length} sub-group${children.length !== 1 ? "s" : ""}`}
          </div>
          {!group.isDefault && stats.totalMain > 0 && (
            <div style={{ fontSize: 12, color: tokens.textTertiary, marginTop: 4 }}>
              {stats.completedMain}/{stats.totalMain} main quests complete
              {children.length > 0 && " (including sub-groups)"}
              {stats.isComplete && (
                <span style={{ color: tokens.stateCompleted, fontWeight: 600 }}> · ✓ Complete</span>
              )}
            </div>
          )}

          {!group.isDefault && (
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button
                onClick={() => onAddSubgroup(group.id)}
                style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, border: `1px solid ${tokens.border}`, color: tokens.textSecondary, backgroundColor: tokens.bgSurface, cursor: "pointer" }}
              >
                + Subgroup
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, border: `1px solid ${tokens.border}`, color: "#e05555", backgroundColor: tokens.bgSurface, cursor: "pointer" }}
              >
                Delete
              </button>
            </div>
          )}

          {!group.isDefault && (
            <div style={{ marginTop: 12 }}>
              <FieldLabel text="Move into" />
              <Select
                value={group.parentId ?? ""}
                onChange={move}
                options={moveTargets}
                tokens={tokens}
                placeholder="None — top level"
              />
              {moveError && <div style={{ color: "#e05555", fontSize: 12, marginTop: 6 }}>{moveError}</div>}
            </div>
          )}
        </div>

        {/* Sub-groups, then this group's own tasks */}
        <div style={{ flex: 1, overflow: "auto", padding: "12px 22px" }}>
          {children.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: tokens.textTertiary, marginBottom: 8 }}>
                Sub-groups
              </div>
              {children.map((child) => {
                const childStats = computeGroupStats(child.id, groups, tasks);
                return (
                  <div
                    key={child.id}
                    onClick={() => onOpenGroup(child)}
                    style={{
                      padding: "10px 14px", marginBottom: 8, cursor: "pointer",
                      backgroundColor: tokens.bgSurface, border: `1px solid ${tokens.border}`,
                      borderRadius: 10, display: "flex", justifyContent: "space-between", alignItems: "center",
                      transition: "border-color 0.12s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = tokens.accent)}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = tokens.border)}
                  >
                    <span style={{ fontSize: 14, fontWeight: 500, color: tokens.textPrimary }}>
                      <span style={{ color: tokens.textTertiary, marginRight: 6 }}>▸</span>
                      {child.name}
                    </span>
                    <span style={{ fontSize: 12, color: tokens.textTertiary }}>
                      {childStats.totalMain > 0 ? `${childStats.completedMain}/${childStats.totalMain}` : "—"}
                    </span>
                  </div>
                );
              })}
              <div style={{ height: 1, backgroundColor: tokens.border, margin: "16px 0 12px" }} />
            </>
          )}

          {groupTasks.length === 0 && (
            <div style={{ textAlign: "center", marginTop: children.length > 0 ? 16 : 48, color: tokens.textTertiary, fontSize: 14 }}>
              No tasks in this group yet.
            </div>
          )}
          {active.map((t) => (
            <TaskRow key={t.id} task={t} tokens={tokens} onClick={() => setSelectedTask(t)} />
          ))}

          {done.length > 0 && <CompletedDivider tokens={tokens} count={done.length} />}

          {done.map((t) => (
            <TaskRow key={t.id} task={t} tokens={tokens} dimmed onClick={() => setSelectedTask(t)} />
          ))}
        </div>
      </div>

      {selectedTask && (
        <TaskModal
          task={selectedTask}
          allTasksInGroup={groupTasks}
          groupName={group.name}
          tokens={tokens}
          onClose={() => setSelectedTask(null)}
        />
      )}

      {confirmDelete && (
        <DeleteGroupModal
          group={group}
          groups={groups}
          tasks={tasks}
          tokens={tokens}
          onClose={() => setConfirmDelete(false)}
          onDeleted={() => { setConfirmDelete(false); onClose(); }}
        />
      )}
    </>
  );
}

/**
 * One row of the group tree. Indent communicates depth; the caret only appears
 * where there is something to collapse.
 */
function GroupTreeRow({ node, groups, tasks, tokens, collapsed, onToggle, onClick, onAddSubgroup }: {
  node: GroupNode;
  groups: Group[];
  tasks: Task[];
  tokens: ColorTokens;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  onClick: (g: Group) => void;
  onAddSubgroup: (parentId: string) => void;
}) {
  const { group, depth, children } = node;
  const [hover, setHover] = useState(false);
  const isCollapsed = collapsed.has(group.id);

  const stats = computeGroupStats(group.id, groups, tasks);
  const directTasks = tasks.filter((t) => t.groupId === group.id);
  const activeDirect = directTasks.filter((t) => t.state !== "completed" && t.state !== "scrapped");
  const progress = stats.totalMain > 0 ? stats.completedMain / stats.totalMain : 0;

  return (
    <>
      <div
        onClick={() => onClick(group)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          backgroundColor: tokens.bgCard,
          border: `1px solid ${hover ? tokens.accent : tokens.border}`,
          borderRadius: 12, padding: "14px 16px", cursor: "pointer",
          marginBottom: 8, marginLeft: depth * INDENT,
          transition: "border-color 0.12s",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, minWidth: 0 }}>
            {/* Caret is a button so collapsing never opens the panel. */}
            {children.length > 0 ? (
              <button
                onClick={(e) => { e.stopPropagation(); onToggle(group.id); }}
                aria-label={isCollapsed ? "Expand" : "Collapse"}
                style={{
                  color: tokens.textTertiary, fontSize: 11, cursor: "pointer",
                  background: "none", border: "none", padding: "2px 2px 0 0",
                  lineHeight: 1.4, flexShrink: 0,
                }}
              >
                {isCollapsed ? "▶" : "▼"}
              </button>
            ) : (
              <span style={{ width: 13, flexShrink: 0 }} />
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: tokens.textPrimary }}>
                {group.isDefault && <span style={{ color: tokens.textTertiary, marginRight: 4 }}>🔒</span>}
                {group.name}
                {children.length > 0 && (
                  <span style={{ fontSize: 12, fontWeight: 400, color: tokens.textTertiary, marginLeft: 8 }}>
                    {children.length} sub-group{children.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
              {group.description && (
                <div style={{ fontSize: 13, color: tokens.textSecondary, marginTop: 2 }}>{group.description}</div>
              )}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, marginLeft: 10 }}>
            {!group.isDefault && hover && (
              <button
                onClick={(e) => { e.stopPropagation(); onAddSubgroup(group.id); }}
                style={{
                  fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 7,
                  border: `1px solid ${tokens.border}`, color: tokens.textSecondary,
                  backgroundColor: tokens.bgSurface, cursor: "pointer", whiteSpace: "nowrap",
                }}
              >
                + Subgroup
              </button>
            )}
            {group.importance !== null && (
              <span style={{ color: tokens.accent, fontSize: 13 }}>
                {"★".repeat(Math.min(group.importance, 5))}
              </span>
            )}
            {group.endDate && (
              <span style={{ fontSize: 12, color: tokens.textTertiary }}>{group.endDate}</span>
            )}
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          {group.isDefault ? (
            <span style={{ fontSize: 12, color: tokens.textTertiary }}>
              {activeDirect.length} active task{activeDirect.length !== 1 ? "s" : ""}
            </span>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: tokens.textTertiary, marginBottom: 6 }}>
                <span>
                  {stats.completedMain}/{stats.totalMain} main quests complete
                  {children.length > 0 && " · incl. sub-groups"}
                </span>
                {stats.isComplete && (
                  <span style={{ color: tokens.stateCompleted, fontWeight: 600 }}>✓ Complete</span>
                )}
              </div>
              {stats.totalMain > 0 && (
                <div style={{ height: 4, borderRadius: 2, backgroundColor: tokens.border, overflow: "hidden" }}>
                  <div style={{ height: 4, width: `${Math.round(progress * 100)}%`, backgroundColor: tokens.accent, borderRadius: 2, transition: "width 0.3s" }} />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {!isCollapsed && children.map((child) => (
        <GroupTreeRow
          key={child.group.id}
          node={child}
          groups={groups}
          tasks={tasks}
          tokens={tokens}
          collapsed={collapsed}
          onToggle={onToggle}
          onClick={onClick}
          onAddSubgroup={onAddSubgroup}
        />
      ))}
    </>
  );
}

export function Groups() {
  const { tokens } = useTheme();
  const store = useStore();
  const [createParentId, setCreateParentId] = useState<string | null | undefined>(undefined);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const tree = useMemo(() => buildGroupTree(store.groups), [store.groups]);

  // Track the selection by id, not by value: a re-parent or rename replaces the
  // object in the store, and a stale copy would keep rendering the old name.
  const selectedGroup = useMemo(
    () => store.groups.find((g) => g.id === selectedGroupId) ?? null,
    [store.groups, selectedGroupId]
  );

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

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
          <h1 style={{ fontSize: 20, fontWeight: 700, color: tokens.textPrimary }}>Groups</h1>
          <button
            onClick={() => setCreateParentId(null)}
            style={{
              padding: "8px 16px", backgroundColor: tokens.accent,
              color: tokens.accentOn, fontWeight: 600, fontSize: 13,
              borderRadius: 8, cursor: "pointer",
            }}
          >
            + New Group
          </button>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "24px" }}>
          {tree.length === 0 && (
            <div style={{ textAlign: "center", marginTop: 60, color: tokens.textTertiary }}>
              No groups yet
            </div>
          )}
          {tree.map((node) => (
            <GroupTreeRow
              key={node.group.id}
              node={node}
              groups={store.groups}
              tasks={store.tasks}
              tokens={tokens}
              collapsed={collapsed}
              onToggle={toggle}
              onClick={(g) => setSelectedGroupId(g.id)}
              onAddSubgroup={(parentId) => setCreateParentId(parentId)}
            />
          ))}
        </div>
      </div>

      {createParentId !== undefined && (
        <CreateGroupModal
          tokens={tokens}
          groups={store.groups}
          initialParentId={createParentId}
          onClose={() => setCreateParentId(undefined)}
        />
      )}

      {selectedGroup && (
        <GroupTasksPanel
          group={selectedGroup}
          groups={store.groups}
          tasks={store.tasks}
          tokens={tokens}
          onClose={() => setSelectedGroupId(null)}
          onOpenGroup={(g) => setSelectedGroupId(g.id)}
          onAddSubgroup={(parentId) => setCreateParentId(parentId)}
        />
      )}
    </>
  );
}
