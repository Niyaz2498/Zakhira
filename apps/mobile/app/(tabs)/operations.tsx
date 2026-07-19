import { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../src/theme/ThemeContext";
import { useStore } from "../../src/store/useStore";
import { computeOperationStats } from "@zakhira/core";
import type { Operation, Task } from "@zakhira/core";
import { TaskDetailModal } from "../../src/components/TaskDetailModal";

function ProgressBar({
  progress,
  tokens,
}: {
  progress: number;
  tokens: any;
}) {
  return (
    <View style={[pbStyles.track, { backgroundColor: tokens.border }]}>
      <View
        style={[
          pbStyles.fill,
          { width: `${Math.round(progress * 100)}%`, backgroundColor: tokens.accent },
        ]}
      />
    </View>
  );
}

const pbStyles = StyleSheet.create({
  track: { height: 4, borderRadius: 2, overflow: "hidden" },
  fill: { height: 4, borderRadius: 2 },
});

function OperationCard({
  op,
  tokens,
  tasks,
  onPress,
}: {
  op: Operation;
  tokens: any;
  tasks: ReturnType<typeof useStore>["tasks"];
  onPress: () => void;
}) {
  const opTasks = tasks.filter((t) => t.operationId === op.id);
  const stats = computeOperationStats(opTasks);
  const activeTasks = opTasks.filter(
    (t) => t.state !== "completed" && t.state !== "scrapped"
  );

  return (
    <TouchableOpacity
      style={[
        cardStyles.card,
        { backgroundColor: tokens.bgCard, borderColor: tokens.border },
      ]}
      activeOpacity={0.8}
      onPress={onPress}
    >
      <View style={cardStyles.row}>
        <View style={{ flex: 1 }}>
          <Text style={[cardStyles.name, { color: tokens.textPrimary }]}>
            {op.isDefault && (
              <Text style={{ color: tokens.textTertiary }}>🔒 </Text>
            )}
            {op.name}
          </Text>
          {op.description && (
            <Text
              style={{ color: tokens.textSecondary, fontSize: 13, marginTop: 2 }}
              numberOfLines={1}
            >
              {op.description}
            </Text>
          )}
        </View>
        {op.importance !== null && (
          <Text style={{ color: tokens.accent, fontSize: 13 }}>
            {"★".repeat(Math.min(op.importance, 5))}
          </Text>
        )}
      </View>

      {op.isDefault ? (
        <Text style={{ color: tokens.textTertiary, fontSize: 12, marginTop: 8 }}>
          {activeTasks.length} active task{activeTasks.length !== 1 ? "s" : ""}
        </Text>
      ) : (
        <View style={{ marginTop: 8 }}>
          <View style={[cardStyles.row, { marginBottom: 4 }]}>
            <Text style={{ color: tokens.textTertiary, fontSize: 12 }}>
              {stats.completedMain}/{stats.totalMain} main quests
            </Text>
            {op.endDate && (
              <Text style={{ color: tokens.textTertiary, fontSize: 12 }}>
                {op.endDate}
              </Text>
            )}
          </View>
          {stats.totalMain > 0 && (
            <ProgressBar
              progress={stats.completedMain / stats.totalMain}
              tokens={tokens}
            />
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  name: { fontSize: 16, fontWeight: "600" },
});

const STATE_COLORS: Record<string, string> = {
  todo: "#64748b", in_progress: "#3b82f6", blocked: "#f59e0b",
  completed: "#22c55e", scrapped: "#475569",
};

export default function OperationsScreen() {
  const { tokens } = useTheme();
  const store = useStore();
  const [selectedOp, setSelectedOp] = useState<Operation | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

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
      <View style={[listStyles.header, { borderBottomColor: tokens.border }]}>
        <Text style={[listStyles.heading, { color: tokens.textPrimary }]}>Operations</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {sorted.map((op) => (
          <OperationCard key={op.id} op={op} tokens={tokens} tasks={store.tasks} onPress={() => setSelectedOp(op)} />
        ))}
        {sorted.length === 0 && (
          <Text style={{ color: tokens.textTertiary, textAlign: "center", marginTop: 60 }}>
            No operations yet
          </Text>
        )}
      </ScrollView>

      {/* Operation detail modal */}
      <Modal visible={selectedOp !== null} animationType="slide" onRequestClose={() => setSelectedOp(null)}>
        <View style={{ flex: 1, backgroundColor: tokens.bgPage }}>
          <View style={[listStyles.header, { borderBottomColor: tokens.border, backgroundColor: tokens.bgSurface, paddingTop: 52 }]}>
            <TouchableOpacity onPress={() => setSelectedOp(null)}>
              <Text style={{ color: tokens.accent, fontWeight: "600", fontSize: 16 }}>✕ Close</Text>
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
                    style={[listStyles.taskRow, { backgroundColor: tokens.bgCard, borderColor: tokens.border }]}
                    activeOpacity={0.75}
                  >
                    <View style={[listStyles.stateDot, { backgroundColor: sc }]} />
                    <Text style={{ flex: 1, color: tokens.textPrimary, fontSize: 14 }} numberOfLines={1}>{task.title}</Text>
                    <Text style={{ color: tokens.textTertiary, fontSize: 12 }}>›</Text>
                  </TouchableOpacity>
                );
              })}
              {opTasks.length === 0 && (
                <Text style={{ color: tokens.textTertiary, textAlign: "center", marginTop: 40 }}>No tasks yet</Text>
              )}
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* Task detail modal (opened from within operation) */}
      <TaskDetailModal
        task={selectedTask}
        opName={selectedOp?.name ?? ""}
        tokens={tokens}
        onClose={() => setSelectedTask(null)}
        onTaskUpdated={(updated) => setSelectedTask(updated)}
      />
    </SafeAreaView>
  );
}

const listStyles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  heading: { fontSize: 22, fontWeight: "700" },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  stateDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
});
