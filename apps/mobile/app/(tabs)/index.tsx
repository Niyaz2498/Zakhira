import { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../src/theme/ThemeContext";
import { useStore } from "../../src/store/useStore";
import { sync } from "../../src/store";
import { TaskDetailModal } from "../../src/components/TaskDetailModal";
import type { Task } from "@zakhira/core";

type GroupBy = "type" | "operation" | "status";

const TYPE_LABELS: Record<string, string> = {
  main: "Main Quests",
  side: "Side Quests",
  exploration: "Exploration",
};
const TYPE_ICONS: Record<string, string> = { main: "⚔", side: "📍", exploration: "⚗" };

const PRIORITY_LABEL: Record<number, string> = { 1: "Low", 2: "Medium", 3: "High" };
const PRIORITY_COLOR: Record<number, string> = { 1: "#5aa9f0", 2: "#f59e0b", 3: "#ef4444" };

const STATUS_GROUP_ORDER = ["todo", "in_progress", "blocked"] as const;
const STATUS_GROUP_LABEL: Record<string, string> = {
  todo: "To-Do", in_progress: "In Progress", blocked: "Blocked",
};

function isOverdue(task: Task): boolean {
  if (!task.endDate || task.state === "completed" || task.state === "scrapped") return false;
  return task.endDate < new Date().toISOString().slice(0, 10);
}
function isThisMonth(iso: string): boolean {
  const d = new Date(iso), n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
}

// ── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, color, icon, tokens }: {
  label: string; value: number; color: string; icon: string; tokens: any;
}) {
  return (
    <View style={[statStyles.card, { backgroundColor: tokens.bgCard, borderColor: tokens.border }]}>
      <View style={[statStyles.bar, { backgroundColor: color }]} />
      <Text style={[statStyles.icon, { color }]}>{icon}</Text>
      <Text style={[statStyles.value, { color: tokens.textPrimary }]}>{value}</Text>
      <Text style={[statStyles.label, { color: tokens.textTertiary }]}>{label}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  card: {
    width: 110,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginRight: 10,
    position: "relative",
    overflow: "hidden",
  },
  bar: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 4,
    bottom: 0,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },
  icon: { fontSize: 13, marginBottom: 6 },
  value: { fontSize: 32, fontWeight: "800", lineHeight: 36, fontVariant: ["tabular-nums"] },
  label: { fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 4 },
});

// ── Task tile ────────────────────────────────────────────────────────────────

function TaskTile({ task, opName, tokens, onPress }: { task: Task; opName: string; tokens: any; onPress: () => void }) {
  const overdue = isOverdue(task);
  const priority = task.importance != null ? PRIORITY_LABEL[task.importance] : null;
  const priorityColor = task.importance != null ? PRIORITY_COLOR[task.importance] : null;

  const tierColor = task.type === "main" ? tokens.tierMain
    : task.type === "side" ? tokens.tierSide
    : tokens.tierExplore;

  const stateColor: Record<string, string> = {
    todo: tokens.stateTodo,
    in_progress: tokens.stateInProgress,
    blocked: tokens.stateBlocked,
    completed: tokens.stateCompleted,
    scrapped: tokens.stateScrapped,
  };

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      style={[tileStyles.tile, { backgroundColor: tokens.bgCard, borderColor: tierColor }]}
    >
      <View style={tileStyles.row}>
        <Text style={[tileStyles.meta, { color: tokens.textTertiary }]} numberOfLines={1}>
          {TYPE_ICONS[task.type]} {opName}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {overdue && <View style={tileStyles.overdueDot} />}
          <View style={[tileStyles.stateDot, { backgroundColor: stateColor[task.state] ?? tokens.stateTodo }]} />
        </View>
      </View>
      <Text style={[tileStyles.title, { color: tokens.textPrimary }]} numberOfLines={2}>
        {task.title}
      </Text>
      <View style={tileStyles.footer}>
        {task.endDate && (
          <Text style={[tileStyles.due, { color: overdue ? "#ef4444" : tokens.textTertiary }]}>
            {task.endDate}
          </Text>
        )}
        {priority && (
          <View style={[tileStyles.badge, { backgroundColor: priorityColor! + "22", borderColor: priorityColor! + "55" }]}>
            <Text style={[tileStyles.badgeText, { color: priorityColor! }]}>{priority}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const tileStyles = StyleSheet.create({
  tile: {
    borderRadius: 10,
    borderWidth: 1.5,
    padding: 12,
    width: "47%",
    minHeight: 90,
  },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  meta: { fontSize: 11, flex: 1 },
  stateDot: { width: 8, height: 8, borderRadius: 4 },
  overdueDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#ef4444" },
  title: { fontSize: 14, fontWeight: "600", lineHeight: 20, marginBottom: 8 },
  footer: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  due: { fontSize: 11 },
  badge: {
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.4 },
});

// ── Dashboard ────────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const { tokens } = useTheme();
  const store = useStore();
  const [groupBy, setGroupBy] = useState<GroupBy>("type");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const handleRefresh = useCallback(() => { sync(); }, []);

  const handleTaskUpdated = useCallback((updated: Task) => {
    // Reflect update locally without a full sync
    setSelectedTask(updated);
  }, []);

  const opMap = useMemo(
    () => new Map(store.operations.map((o) => [o.id, o.name])),
    [store.operations]
  );

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

  const groups = useMemo(() => {
    if (groupBy === "type") {
      return (["main", "side", "exploration"] as const)
        .map((type) => ({ key: type, title: TYPE_LABELS[type]!, data: activeTasks.filter((t) => t.type === type) }))
        .filter((g) => g.data.length > 0);
    }
    if (groupBy === "status") {
      return STATUS_GROUP_ORDER
        .map((s) => ({ key: s, title: STATUS_GROUP_LABEL[s]!, data: activeTasks.filter((t) => t.state === s) }))
        .filter((g) => g.data.length > 0);
    }
    return store.operations
      .map((op) => ({ key: op.id, title: op.name, data: activeTasks.filter((t) => t.operationId === op.id) }))
      .filter((g) => g.data.length > 0);
  }, [groupBy, activeTasks, store.operations]);

  const today = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.bgPage }}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: tokens.border }]}>
        <View>
          <Text style={[s.heading, { color: tokens.textPrimary }]}>Dashboard</Text>
          <Text style={[s.subheading, { color: tokens.textTertiary }]}>
            {today} · {store.tasks.length} task{store.tasks.length !== 1 ? "s" : ""}
          </Text>
        </View>
        <TouchableOpacity onPress={handleRefresh} style={{ padding: 8 }}>
          {store.syncing
            ? <ActivityIndicator size="small" color={tokens.accent} />
            : <Text style={{ fontSize: 22, color: tokens.accent }}>↻</Text>
          }
        </TouchableOpacity>
      </View>

      {/* First-load spinner */}
      {store.syncing && store.tasks.length === 0 && (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={tokens.accent} />
          <Text style={{ color: tokens.textTertiary, marginTop: 12 }}>Syncing…</Text>
        </View>
      )}

      {(!store.syncing || store.tasks.length > 0) && (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshControl={
            <RefreshControl refreshing={store.syncing} onRefresh={handleRefresh} tintColor={tokens.accent} />
          }
        >
          {/* Stat cards */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ padding: 16 }}
          >
            <StatCard label="To-Do"       value={stats.todo}           color={tokens.stateTodo}       icon="○"  tokens={tokens} />
            <StatCard label="In Progress" value={stats.inProgress}     color={tokens.stateInProgress} icon="▶"  tokens={tokens} />
            <StatCard label="Blocked"     value={stats.blocked}        color={tokens.stateBlocked}    icon="⊘"  tokens={tokens} />
            <StatCard label="Overdue"     value={stats.overdue}        color="#ef4444"                icon="⚠"  tokens={tokens} />
            <StatCard label="Done/Month"  value={stats.completedMonth} color={tokens.stateCompleted}  icon="✓"  tokens={tokens} />
            <StatCard label="Scrp/Month"  value={stats.scrappedMonth}  color={tokens.stateScrapped}   icon="✕"  tokens={tokens} />
          </ScrollView>

          {/* Group-by toggle + active task count */}
          <View style={[s.groupBar, { borderColor: tokens.border }]}>
            <Text style={[s.activeLabel, { color: tokens.textSecondary }]}>
              Active <Text style={{ color: tokens.textTertiary, fontWeight: "400" }}>{activeTasks.length}</Text>
            </Text>
            <View style={[s.toggle, { backgroundColor: tokens.bgCard, borderColor: tokens.border }]}>
              {(["type", "operation", "status"] as GroupBy[]).map((g) => (
                <TouchableOpacity
                  key={g}
                  style={[s.toggleBtn, groupBy === g && { backgroundColor: tokens.accent }]}
                  onPress={() => setGroupBy(g)}
                >
                  <Text style={{ fontSize: 11, fontWeight: "600", color: groupBy === g ? tokens.accentOn : tokens.textSecondary }}>
                    {g === "type" ? "Type" : g === "operation" ? "Op" : "Status"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Task groups */}
          <View style={{ padding: 16, paddingTop: 12 }}>
            {groups.length === 0 && (
              <View style={s.empty}>
                <Text style={{ color: tokens.textTertiary, fontSize: 16 }}>No active tasks</Text>
                <Text style={{ color: tokens.textTertiary, fontSize: 13, marginTop: 4 }}>
                  Create tasks from Operations
                </Text>
              </View>
            )}
            {groups.map((group) => (
              <View key={group.key} style={{ marginBottom: 24 }}>
                <Text style={[s.groupTitle, { color: tokens.textSecondary }]}>
                  {group.title}
                  {"  "}
                  <Text style={{ color: tokens.textTertiary, fontWeight: "400" }}>{group.data.length}</Text>
                </Text>
                <View style={s.bento}>
                  {group.data.map((task) => (
                    <TaskTile
                      key={task.id}
                      task={task}
                      opName={opMap.get(task.operationId) ?? ""}
                      tokens={tokens}
                      onPress={() => setSelectedTask(task)}
                    />
                  ))}
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      <TaskDetailModal
        task={selectedTask}
        opName={selectedTask ? (opMap.get(selectedTask.operationId) ?? "") : ""}
        tokens={tokens}
        onClose={() => setSelectedTask(null)}
        onTaskUpdated={handleTaskUpdated}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  heading: { fontSize: 22, fontWeight: "700" },
  subheading: { fontSize: 12, marginTop: 2 },
  groupBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  activeLabel: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 },
  toggle: { flexDirection: "row", borderRadius: 8, borderWidth: 1, overflow: "hidden" },
  toggleBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  bento: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  groupTitle: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  empty: { alignItems: "center", marginTop: 60 },
});
