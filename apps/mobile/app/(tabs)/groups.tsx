import { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../src/theme/ThemeContext";
import { useStore } from "../../src/store/useStore";
import {
  getClient,
  addGroupToStore,
  addTaskToStore,
  updateGroupInStore,
  removeGroupFromStore,
  sync,
} from "../../src/store";
import {
  computeGroupStats,
  splitTasksForDisplay,
  buildGroupTree,
  flattenGroupTree,
  groupSubtreeIds,
  wouldCreateGroupCycle,
} from "@zakhira/core";
import type { Group, GroupNode, Task, TaskType } from "@zakhira/core";
import { TaskDetailModal } from "../../src/components/TaskDetailModal";

/** Indent per nesting level, in px. */
const INDENT = 16;

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ progress, tokens }: { progress: number; tokens: any }) {
  return (
    <View style={[pb.track, { backgroundColor: tokens.border }]}>
      <View style={[pb.fill, { width: `${Math.round(progress * 100)}%`, backgroundColor: tokens.accent }]} />
    </View>
  );
}
const pb = StyleSheet.create({
  track: { height: 4, borderRadius: 2, overflow: "hidden" },
  fill: { height: 4, borderRadius: 2 },
});

// ── Group card ────────────────────────────────────────────────────────────────

/**
 * One row of the tree. Indent shows depth; the caret only appears where there
 * is something to collapse, and is a separate touch target so collapsing never
 * drills into the group.
 */
function GroupCard({ node, groups, tokens, tasks, collapsed, onToggle, onPress }: {
  node: GroupNode;
  groups: Group[];
  tokens: any;
  tasks: Task[];
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  onPress: () => void;
}) {
  const { group, depth, children } = node;
  const isCollapsed = collapsed.has(group.id);
  const stats = computeGroupStats(group.id, groups, tasks);
  const directTasks = tasks.filter((t) => t.groupId === group.id);
  const activeTasks = directTasks.filter((t) => t.state !== "completed" && t.state !== "scrapped");

  return (
    <TouchableOpacity
      style={[
        card.card,
        { backgroundColor: tokens.bgCard, borderColor: tokens.border, marginLeft: depth * INDENT },
      ]}
      activeOpacity={0.8}
      onPress={onPress}
    >
      <View style={card.row}>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "flex-start" }}>
          {children.length > 0 ? (
            <TouchableOpacity
              onPress={onToggle.bind(null, group.id)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{ paddingRight: 8, paddingTop: 2 }}
            >
              <Text style={{ color: tokens.textTertiary, fontSize: 11 }}>
                {isCollapsed ? "▶" : "▼"}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 19 }} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={[card.name, { color: tokens.textPrimary }]}>
              {group.isDefault && <Text style={{ color: tokens.textTertiary }}>🔒 </Text>}
              {group.name}
            </Text>
            {group.description ? (
              <Text style={{ color: tokens.textSecondary, fontSize: 13, marginTop: 2 }} numberOfLines={1}>
                {group.description}
              </Text>
            ) : null}
            {children.length > 0 ? (
              <Text style={{ color: tokens.textTertiary, fontSize: 12, marginTop: 2 }}>
                {children.length} sub-group{children.length !== 1 ? "s" : ""}
              </Text>
            ) : null}
          </View>
        </View>
        {group.importance != null && (
          <Text style={{ color: tokens.accent, fontSize: 13 }}>{"★".repeat(Math.min(group.importance, 5))}</Text>
        )}
      </View>

      {group.isDefault ? (
        <Text style={{ color: tokens.textTertiary, fontSize: 12, marginTop: 8 }}>
          {activeTasks.length} active task{activeTasks.length !== 1 ? "s" : ""}
        </Text>
      ) : (
        <View style={{ marginTop: 8 }}>
          <View style={[card.row, { marginBottom: 4 }]}>
            <Text style={{ color: tokens.textTertiary, fontSize: 12 }}>
              {stats.completedMain}/{stats.totalMain} main quests
              {children.length > 0 ? " · incl. subs" : ""}
            </Text>
            {group.endDate ? <Text style={{ color: tokens.textTertiary, fontSize: 12 }}>{group.endDate}</Text> : null}
          </View>
          {stats.totalMain > 0 && <ProgressBar progress={stats.completedMain / stats.totalMain} tokens={tokens} />}
        </View>
      )}
    </TouchableOpacity>
  );
}
const card = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  name: { fontSize: 16, fontWeight: "600" },
});

/**
 * Groups that may legally parent `group`, indented by depth.
 *
 * Excluded: the group itself and its descendants (the re-parent cycle the
 * backend rejects), and General Tasks, which stays a flat inbox. `null` for
 * `group` means "a new group", which has no descendants yet.
 */
function parentChoices(group: Group | null, groups: Group[]): { id: string; label: string }[] {
  return flattenGroupTree(buildGroupTree(groups))
    .filter(({ group: g }) => {
      if (g.isDefault) return false;
      if (group === null) return true;
      return g.id !== group.id && !wouldCreateGroupCycle(group.id, g.id, groups);
    })
    .map(({ group: g, depth }) => ({ id: g.id, label: `${"  ".repeat(depth)}${g.name}` }));
}

/** Tap-to-select list of parent groups, with a "top level" escape at the top. */
function ParentPicker({ value, choices, tokens, onChange }: {
  value: string | null;
  choices: { id: string; label: string }[];
  tokens: any;
  onChange: (id: string | null) => void;
}) {
  const rows = [{ id: "", label: "None — top level" }, ...choices];
  return (
    <View style={{ marginBottom: 20 }}>
      {rows.map((row) => {
        const selected = (value ?? "") === row.id;
        return (
          <TouchableOpacity
            key={row.id || "__top__"}
            onPress={() => onChange(row.id || null)}
            style={{
              paddingVertical: 11, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1,
              marginBottom: 6,
              borderColor: selected ? tokens.accent : tokens.border,
              backgroundColor: selected ? tokens.accent + "22" : tokens.bgCard,
            }}
          >
            <Text style={{ fontSize: 14, color: selected ? tokens.accent : tokens.textPrimary, fontWeight: selected ? "600" : "400" }}>
              {row.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Create group modal ────────────────────────────────────────────────────────

function CreateGroupModal({ visible, tokens, groups, initialParentId, onClose }: {
  visible: boolean;
  tokens: any;
  groups: Group[];
  initialParentId: string | null;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [endDate, setEndDate] = useState("");
  const [parentId, setParentId] = useState<string | null>(initialParentId);
  const [saving, setSaving] = useState(false);

  // Remount per open (see `key` at the call site) keeps this in sync with the
  // row that was tapped; resetting only on close would lag a step behind.
  function reset() { setName(""); setDescription(""); setEndDate(""); setParentId(initialParentId); }

  const choices = useMemo(() => parentChoices(null, groups), [groups]);

  async function handleCreate() {
    if (!name.trim()) { Alert.alert("Name required"); return; }
    setSaving(true);
    try {
      const client = getClient();
      if (!client) return;
      const res = await client.createGroup({
        name: name.trim(),
        ...(description.trim() && { description: description.trim() }),
        ...(endDate.trim() && { endDate: endDate.trim() }),
        ...(parentId && { parentId }),
      });
      if (!res.ok) { Alert.alert("Error", res.error); return; }
      addGroupToStore(res.data);
      reset();
      onClose();
    } catch { Alert.alert("Error", "Could not create group."); }
    finally { setSaving(false); }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={{ flex: 1, backgroundColor: tokens.bgPage }}>
          <View style={[cm.header, { borderBottomColor: tokens.border, backgroundColor: tokens.bgSurface }]}>
            <TouchableOpacity onPress={() => { reset(); onClose(); }}>
              <Text style={{ color: tokens.textSecondary, fontSize: 16 }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={{ color: tokens.textPrimary, fontSize: 17, fontWeight: "600" }}>New Group</Text>
            <TouchableOpacity onPress={handleCreate} disabled={saving}>
              {saving
                ? <ActivityIndicator size="small" color={tokens.accent} />
                : <Text style={{ color: tokens.accent, fontSize: 16, fontWeight: "600" }}>Create</Text>}
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
            <Text style={[cm.label, { color: tokens.textSecondary }]}>Name *</Text>
            <TextInput
              style={[cm.input, { backgroundColor: tokens.bgCard, borderColor: tokens.border, color: tokens.textPrimary }]}
              value={name} onChangeText={setName} placeholder="Group name"
              placeholderTextColor={tokens.textTertiary} autoFocus
            />
            <Text style={[cm.label, { color: tokens.textSecondary }]}>Parent Group</Text>
            <ParentPicker value={parentId} choices={choices} tokens={tokens} onChange={setParentId} />
            <Text style={[cm.label, { color: tokens.textSecondary }]}>Description</Text>
            <TextInput
              style={[cm.input, { backgroundColor: tokens.bgCard, borderColor: tokens.border, color: tokens.textPrimary, height: 80 }]}
              value={description} onChangeText={setDescription} placeholder="Optional"
              placeholderTextColor={tokens.textTertiary} multiline
            />
            <Text style={[cm.label, { color: tokens.textSecondary }]}>Due Date</Text>
            <TextInput
              style={[cm.input, { backgroundColor: tokens.bgCard, borderColor: tokens.border, color: tokens.textPrimary }]}
              value={endDate} onChangeText={setEndDate} placeholder="YYYY-MM-DD"
              placeholderTextColor={tokens.textTertiary} keyboardType="numbers-and-punctuation"
            />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Move group modal ──────────────────────────────────────────────────────────

function MoveGroupModal({ group, groups, tokens, onClose }: {
  group: Group | null;
  groups: Group[];
  tokens: any;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const choices = useMemo(() => (group ? parentChoices(group, groups) : []), [group, groups]);

  async function move(parentId: string | null) {
    if (!group) return;
    setBusy(true);
    try {
      const client = getClient();
      if (!client) return;
      const res = await client.updateGroup(group.id, { parentId });
      if (!res.ok) { Alert.alert("Error", res.error); return; }
      updateGroupInStore(res.data);
      onClose();
    } catch { Alert.alert("Error", "Could not move group."); }
    finally { setBusy(false); }
  }

  return (
    <Modal visible={group !== null} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: tokens.bgPage }}>
        <View style={[cm.header, { borderBottomColor: tokens.border, backgroundColor: tokens.bgSurface }]}>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ color: tokens.textSecondary, fontSize: 16 }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={{ color: tokens.textPrimary, fontSize: 17, fontWeight: "600" }}>Move Group</Text>
          <View style={{ width: 50 }}>{busy ? <ActivityIndicator size="small" color={tokens.accent} /> : null}</View>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <Text style={{ color: tokens.textSecondary, fontSize: 13, marginBottom: 16 }}>
            Move “{group?.name}” into:
          </Text>
          <ParentPicker
            value={group?.parentId ?? null}
            choices={choices}
            tokens={tokens}
            onChange={move}
          />
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Create task modal ─────────────────────────────────────────────────────────

const TASK_TYPES: { key: TaskType; label: string; icon: string }[] = [
  { key: "main", label: "Main Quest", icon: "⚔" },
  { key: "side", label: "Side Quest", icon: "📍" },
  { key: "exploration", label: "Exploration", icon: "⚗" },
];

function CreateTaskModal({ visible, groupId, tokens, onClose }: {
  visible: boolean; groupId: string; tokens: any; onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<TaskType>("main");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() { setTitle(""); setType("main"); setEndDate(""); setNotes(""); }

  async function handleCreate() {
    if (!title.trim()) { Alert.alert("Title required"); return; }
    setSaving(true);
    try {
      const client = getClient();
      if (!client) return;
      const res = await client.createTask({
        title: title.trim(),
        groupId,
        type,
        ...(endDate.trim() && { endDate: endDate.trim() }),
        ...(notes.trim() && { notes: notes.trim() }),
      });
      if (!res.ok) { Alert.alert("Error", res.error); return; }
      addTaskToStore(res.data);
      reset();
      onClose();
    } catch { Alert.alert("Error", "Could not create task."); }
    finally { setSaving(false); }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={{ flex: 1, backgroundColor: tokens.bgPage }}>
          <View style={[cm.header, { borderBottomColor: tokens.border, backgroundColor: tokens.bgSurface }]}>
            <TouchableOpacity onPress={() => { reset(); onClose(); }}>
              <Text style={{ color: tokens.textSecondary, fontSize: 16 }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={{ color: tokens.textPrimary, fontSize: 17, fontWeight: "600" }}>New Task</Text>
            <TouchableOpacity onPress={handleCreate} disabled={saving}>
              {saving
                ? <ActivityIndicator size="small" color={tokens.accent} />
                : <Text style={{ color: tokens.accent, fontSize: 16, fontWeight: "600" }}>Create</Text>}
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
            <Text style={[cm.label, { color: tokens.textSecondary }]}>Title *</Text>
            <TextInput
              style={[cm.input, { backgroundColor: tokens.bgCard, borderColor: tokens.border, color: tokens.textPrimary }]}
              value={title} onChangeText={setTitle} placeholder="Task title"
              placeholderTextColor={tokens.textTertiary} autoFocus
            />
            <Text style={[cm.label, { color: tokens.textSecondary }]}>Type</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
              {TASK_TYPES.map((t) => (
                <TouchableOpacity
                  key={t.key}
                  onPress={() => setType(t.key)}
                  style={[cm.typeBtn, {
                    flex: 1,
                    borderColor: type === t.key ? tokens.accent : tokens.border,
                    backgroundColor: type === t.key ? tokens.accent + "22" : tokens.bgCard,
                  }]}
                >
                  <Text style={{ fontSize: 16 }}>{t.icon}</Text>
                  <Text style={{ fontSize: 10, fontWeight: "600", color: type === t.key ? tokens.accent : tokens.textSecondary, marginTop: 4 }}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[cm.label, { color: tokens.textSecondary }]}>Due Date</Text>
            <TextInput
              style={[cm.input, { backgroundColor: tokens.bgCard, borderColor: tokens.border, color: tokens.textPrimary }]}
              value={endDate} onChangeText={setEndDate} placeholder="YYYY-MM-DD"
              placeholderTextColor={tokens.textTertiary} keyboardType="numbers-and-punctuation"
            />
            <Text style={[cm.label, { color: tokens.textSecondary }]}>Notes</Text>
            <TextInput
              style={[cm.input, { backgroundColor: tokens.bgCard, borderColor: tokens.border, color: tokens.textPrimary, height: 80 }]}
              value={notes} onChangeText={setNotes} placeholder="Optional"
              placeholderTextColor={tokens.textTertiary} multiline
            />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const cm = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 52, paddingBottom: 14, borderBottomWidth: 1,
  },
  label: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15, marginBottom: 20 },
  typeBtn: { borderWidth: 1, borderRadius: 10, padding: 10, alignItems: "center" },
});

// ── Groups screen ─────────────────────────────────────────────────────────────

const STATE_COLORS: Record<string, string> = {
  todo: "#64748b", in_progress: "#3b82f6", blocked: "#f59e0b",
  completed: "#22c55e", scrapped: "#475569",
};

// ── Task list pieces ──────────────────────────────────────────────────────────

/** A single task row. Finished tasks render dimmed so the eye skips past them. */
function TaskRow({ task, tokens, onPress, dimmed }: {
  task: Task; tokens: any; onPress: () => void; dimmed?: boolean;
}) {
  const sc = STATE_COLORS[task.state] ?? "#64748b";
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        ls.taskRow,
        { backgroundColor: tokens.bgCard, borderColor: tokens.border },
        dimmed && { opacity: 0.55 },
      ]}
      activeOpacity={0.75}
    >
      <View style={[ls.stateDot, { backgroundColor: sc }]} />
      <Text
        style={[
          { flex: 1, color: tokens.textPrimary, fontSize: 14 },
          task.state === "completed" && { textDecorationLine: "line-through" as const },
        ]}
        numberOfLines={1}
      >
        {task.title}
      </Text>
      <Text style={{ color: tokens.textTertiary, fontSize: 12 }}>›</Text>
    </TouchableOpacity>
  );
}

/** Rule with a centred "Completed" label, separating open work from finished. */
function CompletedDivider({ tokens, count }: { tokens: any; count: number }) {
  return (
    <View style={ls.divider}>
      <View style={[ls.dividerLine, { backgroundColor: tokens.border }]} />
      <Text style={[ls.dividerLabel, { color: tokens.textTertiary }]}>
        Completed {count}
      </Text>
      <View style={[ls.dividerLine, { backgroundColor: tokens.border }]} />
    </View>
  );
}

export default function GroupsScreen() {
  const { tokens } = useTheme();
  const store = useStore();
  // The selection is held by id, not by value: a re-parent or rename replaces
  // the object in the store, and a stale copy would show the old name.
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [createParentId, setCreateParentId] = useState<string | null | undefined>(undefined);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [movingGroup, setMovingGroup] = useState<Group | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const tree = useMemo(() => buildGroupTree(store.groups), [store.groups]);
  const visibleRows = useMemo(() => {
    // Hide anything whose ancestor is collapsed, while keeping tree order.
    const rows: GroupNode[] = [];
    const walk = (nodes: GroupNode[]) => {
      for (const node of nodes) {
        rows.push(node);
        if (!collapsed.has(node.group.id)) walk(node.children);
      }
    };
    walk(tree);
    return rows;
  }, [tree, collapsed]);

  const selectedGroup = useMemo(
    () => store.groups.find((g) => g.id === selectedGroupId) ?? null,
    [store.groups, selectedGroupId]
  );

  const groupTasks = useMemo(
    () => selectedGroup ? store.tasks.filter((t) => t.groupId === selectedGroup.id) : [],
    [selectedGroup, store.tasks]
  );

  const children = useMemo(
    () => selectedGroup
      ? store.groups.filter((g) => g.parentId === selectedGroup.id).sort((a, b) => a.name.localeCompare(b.name))
      : [],
    [selectedGroup, store.groups]
  );

  const { active: activeTasks, done: doneTasks } = useMemo(
    () => splitTasksForDisplay(groupTasks),
    [groupTasks]
  );

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  /**
   * Delete the selected group. The counts in the prompt come from the real
   * subtree, so "delete everything" states how much everything is.
   */
  function confirmDelete(group: Group) {
    const subtree = groupSubtreeIds(group.id, store.groups);
    const subgroupCount = subtree.length - 1;
    const subtreeTaskCount = store.tasks.filter((t) => subtree.includes(t.groupId)).length;
    const directCount = store.tasks.filter((t) => t.groupId === group.id).length;
    const parentName = group.parentId
      ? (store.groups.find((g) => g.id === group.parentId)?.name ?? "its parent")
      : "the top level";

    const run = async (strategy: "move" | "cascade") => {
      try {
        const client = getClient();
        if (!client) return;
        const res = await client.deleteGroup(group.id, strategy);
        if (!res.ok) { Alert.alert("Error", res.error); return; }
        removeGroupFromStore(group.id);
        setSelectedGroupId(null);
        // The server moved tasks and re-parented sub-groups; re-sync rather
        // than guess at the result locally.
        await sync();
      } catch { Alert.alert("Error", "Could not delete group."); }
    };

    Alert.alert(
      `Delete “${group.name}”?`,
      subgroupCount > 0
        ? `${subgroupCount} sub-group${subgroupCount !== 1 ? "s" : ""} and ${subtreeTaskCount} task${subtreeTaskCount !== 1 ? "s" : ""} sit inside it.`
        : `${directCount} task${directCount !== 1 ? "s" : ""} sit inside it.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: subgroupCount > 0 ? `Keep contents (move to ${parentName})` : "Keep tasks (move to General)",
          onPress: () => void run("move"),
        },
        {
          text: `Delete all ${subtreeTaskCount} task${subtreeTaskCount !== 1 ? "s" : ""}`,
          style: "destructive",
          onPress: () => void run("cascade"),
        },
      ]
    );
  }

  const selectedStats = selectedGroup
    ? computeGroupStats(selectedGroup.id, store.groups, store.tasks)
    : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.bgPage }}>
      {/* Header */}
      <View style={[ls.header, { borderBottomColor: tokens.border }]}>
        <Text style={[ls.heading, { color: tokens.textPrimary }]}>Groups</Text>
        <TouchableOpacity onPress={() => setCreateParentId(null)} style={{ padding: 8 }}>
          <Text style={{ fontSize: 26, color: tokens.accent, lineHeight: 28 }}>+</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {visibleRows.map((node) => (
          <GroupCard
            key={node.group.id}
            node={node}
            groups={store.groups}
            tokens={tokens}
            tasks={store.tasks}
            collapsed={collapsed}
            onToggle={toggle}
            onPress={() => setSelectedGroupId(node.group.id)}
          />
        ))}
        {visibleRows.length === 0 && (
          <Text style={{ color: tokens.textTertiary, textAlign: "center", marginTop: 60 }}>No groups yet</Text>
        )}
      </ScrollView>

      {/* Group detail modal */}
      <Modal visible={selectedGroup !== null} animationType="slide" onRequestClose={() => setSelectedGroupId(null)}>
        <View style={{ flex: 1, backgroundColor: tokens.bgPage }}>
          <View style={[ls.header, { borderBottomColor: tokens.border, backgroundColor: tokens.bgSurface, paddingTop: 52 }]}>
            <TouchableOpacity onPress={() => setSelectedGroupId(null)}>
              <Text style={{ color: tokens.accent, fontWeight: "600", fontSize: 16 }}>✕ Close</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowCreateTask(true)} style={{ padding: 4 }}>
              <Text style={{ fontSize: 26, color: tokens.accent, lineHeight: 28 }}>+</Text>
            </TouchableOpacity>
          </View>
          {selectedGroup && (
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
              <Text style={{ fontSize: 22, fontWeight: "700", color: tokens.textPrimary, marginBottom: 4 }}>
                {selectedGroup.name}
              </Text>
              {selectedGroup.description ? (
                <Text style={{ color: tokens.textSecondary, fontSize: 14, marginBottom: 16 }}>{selectedGroup.description}</Text>
              ) : null}
              {selectedGroup.endDate ? (
                <Text style={{ color: tokens.textTertiary, fontSize: 12, marginBottom: 8 }}>Due {selectedGroup.endDate}</Text>
              ) : null}
              {!selectedGroup.isDefault && selectedStats && selectedStats.totalMain > 0 ? (
                <Text style={{ color: tokens.textTertiary, fontSize: 12, marginBottom: 16 }}>
                  {selectedStats.completedMain}/{selectedStats.totalMain} main quests complete
                  {children.length > 0 ? " (including sub-groups)" : ""}
                  {selectedStats.isComplete ? " · ✓ Complete" : ""}
                </Text>
              ) : null}

              {/* Group actions */}
              {!selectedGroup.isDefault && (
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
                  <TouchableOpacity
                    onPress={() => setCreateParentId(selectedGroup.id)}
                    style={[ls.actionBtn, { borderColor: tokens.border, backgroundColor: tokens.bgCard }]}
                  >
                    <Text style={{ color: tokens.textSecondary, fontSize: 12, fontWeight: "600" }}>+ Subgroup</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setMovingGroup(selectedGroup)}
                    style={[ls.actionBtn, { borderColor: tokens.border, backgroundColor: tokens.bgCard }]}
                  >
                    <Text style={{ color: tokens.textSecondary, fontSize: 12, fontWeight: "600" }}>Move</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => confirmDelete(selectedGroup)}
                    style={[ls.actionBtn, { borderColor: tokens.border, backgroundColor: tokens.bgCard }]}
                  >
                    <Text style={{ color: "#ef4444", fontSize: 12, fontWeight: "600" }}>Delete</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Sub-groups */}
              {children.length > 0 && (
                <>
                  <Text style={[ls.sectionLabel, { color: tokens.textSecondary }]}>
                    Sub-groups  <Text style={{ color: tokens.textTertiary, fontWeight: "400" }}>{children.length}</Text>
                  </Text>
                  {children.map((child) => {
                    const childStats = computeGroupStats(child.id, store.groups, store.tasks);
                    return (
                      <TouchableOpacity
                        key={child.id}
                        onPress={() => setSelectedGroupId(child.id)}
                        style={[ls.taskRow, { backgroundColor: tokens.bgCard, borderColor: tokens.border }]}
                        activeOpacity={0.75}
                      >
                        <Text style={{ color: tokens.textTertiary, fontSize: 12 }}>▸</Text>
                        <Text style={{ flex: 1, color: tokens.textPrimary, fontSize: 14 }} numberOfLines={1}>
                          {child.name}
                        </Text>
                        <Text style={{ color: tokens.textTertiary, fontSize: 12 }}>
                          {childStats.totalMain > 0 ? `${childStats.completedMain}/${childStats.totalMain}` : "—"}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  <View style={{ height: 20 }} />
                </>
              )}

              <Text style={[ls.sectionLabel, { color: tokens.textSecondary }]}>
                Tasks  <Text style={{ color: tokens.textTertiary, fontWeight: "400" }}>{groupTasks.length}</Text>
              </Text>
              {activeTasks.map((task) => (
                <TaskRow key={task.id} task={task} tokens={tokens} onPress={() => setSelectedTask(task)} />
              ))}

              {doneTasks.length > 0 && <CompletedDivider tokens={tokens} count={doneTasks.length} />}

              {doneTasks.map((task) => (
                <TaskRow key={task.id} task={task} tokens={tokens} dimmed onPress={() => setSelectedTask(task)} />
              ))}
              {groupTasks.length === 0 && (
                <Text style={{ color: tokens.textTertiary, textAlign: "center", marginTop: 40 }}>
                  No tasks yet — tap + to add one
                </Text>
              )}
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* Task detail modal */}
      <TaskDetailModal
        task={selectedTask}
        groupName={selectedGroup?.name ?? ""}
        tokens={tokens}
        onClose={() => setSelectedTask(null)}
        onTaskUpdated={(updated) => setSelectedTask(updated)}
      />

      {/* Create group modal — keyed so the parent preselection follows the tap */}
      {createParentId !== undefined && (
        <CreateGroupModal
          key={createParentId ?? "__top__"}
          visible
          tokens={tokens}
          groups={store.groups}
          initialParentId={createParentId}
          onClose={() => setCreateParentId(undefined)}
        />
      )}

      {/* Move group modal */}
      <MoveGroupModal
        group={movingGroup}
        groups={store.groups}
        tokens={tokens}
        onClose={() => setMovingGroup(null)}
      />

      {/* Create task modal — only meaningful when a group is selected */}
      <CreateTaskModal
        visible={showCreateTask}
        groupId={selectedGroup?.id ?? ""}
        tokens={tokens}
        onClose={() => setShowCreateTask(false)}
      />
    </SafeAreaView>
  );
}

const ls = StyleSheet.create({
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1,
  },
  heading: { fontSize: 22, fontWeight: "700" },
  taskRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 8,
  },
  stateDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  divider: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 18, marginBottom: 12 },
  dividerLine: { flex: 1, height: 1 },
  dividerLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 },
  sectionLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 12 },
  actionBtn: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1 },
});
