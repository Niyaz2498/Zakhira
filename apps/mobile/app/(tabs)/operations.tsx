import { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../src/theme/ThemeContext";
import { useStore } from "../../src/store/useStore";
import { computeOperationStats } from "@zakhira/core";
import type { Operation } from "@zakhira/core";

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
}: {
  op: Operation;
  tokens: any;
  tasks: ReturnType<typeof useStore>["tasks"];
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

export default function OperationsScreen() {
  const { tokens } = useTheme();
  const store = useStore();

  const sorted = useMemo(() => {
    const defaults = store.operations.filter((o) => o.isDefault);
    const rest = store.operations.filter((o) => !o.isDefault);
    return [...defaults, ...rest];
  }, [store.operations]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.bgPage }}>
      <View style={[listStyles.header, { borderBottomColor: tokens.border }]}>
        <Text style={[listStyles.heading, { color: tokens.textPrimary }]}>Operations</Text>
        <TouchableOpacity style={[listStyles.newBtn, { backgroundColor: tokens.accent }]}>
          <Text style={{ color: tokens.accentOn, fontWeight: "600", fontSize: 14 }}>+ New</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {sorted.map((op) => (
          <OperationCard key={op.id} op={op} tokens={tokens} tasks={store.tasks} />
        ))}
        {sorted.length === 0 && (
          <Text style={{ color: tokens.textTertiary, textAlign: "center", marginTop: 60 }}>
            No operations yet
          </Text>
        )}
      </ScrollView>
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
  newBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
});
