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
import { getClient, addOperationToStore, addTaskToStore } from "../../src/store";
import { computeOperationStats } from "@zakhira/core";
import type { Operation, Task, TaskType } from "@zakhira/core";
import { TaskDetailModal } from "../../src/components/TaskDetailModal";

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

// ── Operation card ────────────────────────────────────────────────────────────

function OperationCard({ op, tokens, tasks, onPress }: {
  op: Operation; tokens: any; tasks: Task[]; onPress: () => void;
}) {
  const opTasks = tasks.filter((t) => t.operationId === op.id);
  const stats = computeOperationStats(opTasks);
  const activeTasks = opTasks.filter((t) => t.state !== "completed" && t.state !== "scrapped");

  return (
    <TouchableOpacity
      style={[card.card, { backgroundColor: tokens.bgCard, borderColor: tokens.border }]}
      activeOpacity={0.8}
      onPress={onPress}
    >
      <View style={card.row}>
        <View style={{ flex: 1 }}>
          <Text style={[card.name, { color: tokens.textPrimary }]}>
            {op.isDefault && <Text style={{ color: tokens.textTertiary }}>🔒 </Text>}
            {op.name}
          </Text>
          {op.description ? (
            <Text style={{ color: tokens.textSecondary, fontSize: 13, marginTop: 2 }} numberOfLines={1}>
              {op.description}
            </Text>
          ) : null}
        </View>
        {op.importance != null && (
          <Text style={{ color: tokens.accent, fontSize: 13 }}>{"★".repeat(Math.min(op.importance, 5))}</Text>
        )}
      </View>

      {op.isDefault ? (
        <Text style={{ color: tokens.textTertiary, fontSize: 12, marginTop: 8 }}>
          {activeTasks.length} active task{activeTasks.length !== 1 ? "s" : ""}
        </Text>
      ) : (
        <View style={{ marginTop: 8 }}>
          <View style={[card.row, { marginBottom: 4 }]}>
            <Text style={{ color: tokens.textTertiary, fontSize: 12 }}>{stats.completedMain}/{stats.totalMain} main quests</Text>
            {op.endDate ? <Text style={{ color: tokens.textTertiary, fontSize: 12 }}>{op.endDate}</Text> : null}
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

// ── Create operation modal ─────────────────────────────────────────────────────

function CreateOperationModal({ visible, tokens, onClose }: {
  visible: boolean; tokens: any; onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() { setName(""); setDescription(""); setEndDate(""); }

  async function handleCreate() {
    if (!name.trim()) { Alert.alert("Name required"); return; }
    setSaving(true);
    try {
      const client = getClient();
      if (!client) return;
      const res = await client.createOperation({
        name: name.trim(),
        ...(description.trim() && { description: description.trim() }),
        ...(endDate.trim() && { endDate: endDate.trim() }),
      });
      if (!res.ok) { Alert.alert("Error", res.error); return; }
      addOperationToStore(res.data);
      reset();
      onClose();
    } catch { Alert.alert("Error", "Could not create operation."); }
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
            <Text style={{ color: tokens.textPrimary, fontSize: 17, fontWeight: "600" }}>New Operation</Text>
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
              value={name} onChangeText={setName} placeholder="Operation name"
              placeholderTextColor={tokens.textTertiary} autoFocus
            />
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

// ── Create task modal ─────────────────────────────────────────────────────────

const TASK_TYPES: { key: TaskType; label: string; icon: string }[] = [
  { key: "main", label: "Main Quest", icon: "⚔" },
  { key: "side", label: "Side Quest", icon: "📍" },
  { key: "exploration", label: "Exploration", icon: "⚗" },
];

function CreateTaskModal({ visible, operationId, tokens, onClose }: {
  visible: boolean; operationId: string; tokens: any; onClose: () => void;
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
        operationId,
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

// ── Operations screen ─────────────────────────────────────────────────────────

const STATE_COLORS: Record<string, string> = {
  todo: "#64748b", in_progress: "#3b82f6", blocked: "#f59e0b",
  completed: "#22c55e", scrapped: "#475569",
};

export default function OperationsScreen() {
  const { tokens } = useTheme();
  const store = useStore();
  const [selectedOp, setSelectedOp] = useState<Operation | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showCreateOp, setShowCreateOp] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);

  const sorted = useMemo(() => {
    const defaults = store.operations.filter((o) => o.isDefault);
    const rest = store.operations.filter((o) => !o.isDefault);
    return [...defaults, ...rest];
  }, [store.operations]);

  const opTasks = useMemo(
    () => selectedOp ? store.tasks.filter((t) => t.operationId === selectedOp.id) : [],
    [selectedOp, store.tasks]
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.bgPage }}>
      {/* Header */}
      <View style={[ls.header, { borderBottomColor: tokens.border }]}>
        <Text style={[ls.heading, { color: tokens.textPrimary }]}>Operations</Text>
        <TouchableOpacity onPress={() => setShowCreateOp(true)} style={{ padding: 8 }}>
          <Text style={{ fontSize: 26, color: tokens.accent, lineHeight: 28 }}>+</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {sorted.map((op) => (
          <OperationCard key={op.id} op={op} tokens={tokens} tasks={store.tasks} onPress={() => setSelectedOp(op)} />
        ))}
        {sorted.length === 0 && (
          <Text style={{ color: tokens.textTertiary, textAlign: "center", marginTop: 60 }}>No operations yet</Text>
        )}
      </ScrollView>

      {/* Operation detail modal */}
      <Modal visible={selectedOp !== null} animationType="slide" onRequestClose={() => setSelectedOp(null)}>
        <View style={{ flex: 1, backgroundColor: tokens.bgPage }}>
          <View style={[ls.header, { borderBottomColor: tokens.border, backgroundColor: tokens.bgSurface, paddingTop: 52 }]}>
            <TouchableOpacity onPress={() => setSelectedOp(null)}>
              <Text style={{ color: tokens.accent, fontWeight: "600", fontSize: 16 }}>✕ Close</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowCreateTask(true)} style={{ padding: 4 }}>
              <Text style={{ fontSize: 26, color: tokens.accent, lineHeight: 28 }}>+</Text>
            </TouchableOpacity>
          </View>
          {selectedOp && (
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
              <Text style={{ fontSize: 22, fontWeight: "700", color: tokens.textPrimary, marginBottom: 4 }}>
                {selectedOp.name}
              </Text>
              {selectedOp.description ? (
                <Text style={{ color: tokens.textSecondary, fontSize: 14, marginBottom: 16 }}>{selectedOp.description}</Text>
              ) : null}
              {selectedOp.endDate ? (
                <Text style={{ color: tokens.textTertiary, fontSize: 12, marginBottom: 16 }}>Due {selectedOp.endDate}</Text>
              ) : null}
              <Text style={{ fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, color: tokens.textSecondary, marginBottom: 12 }}>
                Tasks  <Text style={{ color: tokens.textTertiary, fontWeight: "400" }}>{opTasks.length}</Text>
              </Text>
              {opTasks.map((task) => {
                const sc = STATE_COLORS[task.state] ?? "#64748b";
                return (
                  <TouchableOpacity
                    key={task.id}
                    onPress={() => setSelectedTask(task)}
                    style={[ls.taskRow, { backgroundColor: tokens.bgCard, borderColor: tokens.border }]}
                    activeOpacity={0.75}
                  >
                    <View style={[ls.stateDot, { backgroundColor: sc }]} />
                    <Text style={{ flex: 1, color: tokens.textPrimary, fontSize: 14 }} numberOfLines={1}>{task.title}</Text>
                    <Text style={{ color: tokens.textTertiary, fontSize: 12 }}>›</Text>
                  </TouchableOpacity>
                );
              })}
              {opTasks.length === 0 && (
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
        opName={selectedOp?.name ?? ""}
        tokens={tokens}
        onClose={() => setSelectedTask(null)}
        onTaskUpdated={(updated) => setSelectedTask(updated)}
      />

      {/* Create operation modal */}
      <CreateOperationModal
        visible={showCreateOp}
        tokens={tokens}
        onClose={() => setShowCreateOp(false)}
      />

      {/* Create task modal — only mounted when an op is selected */}
      <CreateTaskModal
        visible={showCreateTask}
        operationId={selectedOp?.id ?? ""}
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
});
