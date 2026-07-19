import { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../src/theme/ThemeContext";
import { useStore } from "../../src/store/useStore";
import type { Task } from "@zakhira/core";

type GroupBy = "type" | "operation";

const TYPE_LABELS: Record<string, string> = {
  main: "Main Quests",
  side: "Side Quests",
  exploration: "Exploration",
};

const TYPE_ICONS: Record<string, string> = {
  main: "⚔",
  side: "📍",
  exploration: "⚗",
};

function StateDot({ state, tokens }: { state: string; tokens: any }) {
  const colorMap: Record<string, string> = {
    todo: tokens.stateTodo,
    in_progress: tokens.stateInProgress,
    blocked: tokens.stateBlocked,
    completed: tokens.stateCompleted,
    scrapped: tokens.stateScrapped,
  };
  return (
    <View
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: colorMap[state] ?? tokens.stateTodo,
      }}
    />
  );
}

function TierBorder({ type, tokens }: { type: string; tokens: any }) {
  const colorMap: Record<string, string> = {
    main: tokens.tierMain,
    side: tokens.tierSide,
    exploration: tokens.tierExplore,
  };
  return colorMap[type] ?? tokens.border;
}

function TaskTile({
  task,
  opName,
  tokens,
  onPress,
}: {
  task: Task;
  opName: string;
  tokens: any;
  onPress: () => void;
}) {
  const borderColor = TierBorder({ type: task.type, tokens });
  return (
    <TouchableOpacity
      style={[styles.tile, { backgroundColor: tokens.bgCard, borderColor }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.tileHeader}>
        <Text style={{ color: tokens.textTertiary, fontSize: 12 }}>
          {TYPE_ICONS[task.type]} {opName}
        </Text>
        <StateDot state={task.state} tokens={tokens} />
      </View>
      <Text style={[styles.tileTitle, { color: tokens.textPrimary }]} numberOfLines={2}>
        {task.title}
      </Text>
      {task.endDate && (
        <Text style={{ color: tokens.textTertiary, fontSize: 11, marginTop: 4 }}>
          Due {task.endDate}
        </Text>
      )}
      {task.importance !== null && (
        <Text style={{ color: tokens.accent, fontSize: 11 }}>
          {"★".repeat(Math.min(task.importance, 5))}
        </Text>
      )}
    </TouchableOpacity>
  );
}

export default function DashboardScreen() {
  const { tokens } = useTheme();
  const store = useStore();
  const [groupBy, setGroupBy] = useState<GroupBy>("type");

  const opMap = useMemo(
    () => new Map(store.operations.map((o) => [o.id, o.name])),
    [store.operations]
  );

  const activeTasks = useMemo(
    () => store.tasks.filter((t) => t.state !== "completed" && t.state !== "scrapped"),
    [store.tasks]
  );

  const groups = useMemo(() => {
    if (groupBy === "type") {
      const types: Array<"main" | "side" | "exploration"> = ["main", "side", "exploration"];
      return types
        .map((type) => ({
          key: type,
          title: TYPE_LABELS[type] ?? type,
          data: activeTasks.filter((t) => t.type === type),
        }))
        .filter((g) => g.data.length > 0);
    } else {
      return store.operations
        .map((op) => ({
          key: op.id,
          title: op.name,
          data: activeTasks.filter((t) => t.operationId === op.id),
        }))
        .filter((g) => g.data.length > 0);
    }
  }, [groupBy, activeTasks, store.operations]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.bgPage }}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: tokens.border }]}>
        <Text style={[styles.heading, { color: tokens.textPrimary }]}>Dashboard</Text>
        <View style={[styles.toggle, { backgroundColor: tokens.bgCard, borderColor: tokens.border }]}>
          {(["type", "operation"] as GroupBy[]).map((g) => (
            <TouchableOpacity
              key={g}
              style={[
                styles.toggleBtn,
                groupBy === g && { backgroundColor: tokens.accent },
              ]}
              onPress={() => setGroupBy(g)}
            >
              <Text
                style={{
                  fontSize: 12,
                  color: groupBy === g ? tokens.accentOn : tokens.textSecondary,
                  fontWeight: "500",
                }}
              >
                {g === "type" ? "Type" : "Operation"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {groups.length === 0 && (
          <View style={styles.empty}>
            <Text style={{ color: tokens.textTertiary, fontSize: 16 }}>No active tasks</Text>
            <Text style={{ color: tokens.textTertiary, fontSize: 13, marginTop: 4 }}>
              Create a task from Operations
            </Text>
          </View>
        )}
        {groups.map((group) => (
          <View key={group.key} style={{ marginBottom: 24 }}>
            <Text style={[styles.groupTitle, { color: tokens.textSecondary }]}>
              {group.title}
            </Text>
            <View style={styles.bento}>
              {group.data.map((task) => (
                <TaskTile
                  key={task.id}
                  task={task}
                  opName={opMap.get(task.operationId) ?? ""}
                  tokens={tokens}
                  onPress={() => {/* TODO: open task modal */}}
                />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  heading: { fontSize: 22, fontWeight: "700" },
  toggle: { flexDirection: "row", borderRadius: 8, borderWidth: 1, overflow: "hidden" },
  toggleBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  bento: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: {
    borderRadius: 10,
    borderWidth: 1.5,
    padding: 12,
    width: "47%",
    minHeight: 80,
  },
  tileHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  tileTitle: { fontSize: 14, fontWeight: "500", lineHeight: 20 },
  groupTitle: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 },
  empty: { alignItems: "center", marginTop: 80 },
});
