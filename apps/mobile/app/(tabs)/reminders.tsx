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
import type { Reminder } from "@zakhira/core";

const RECURRENCE_LABEL: Record<string, string> = {
  once: "Once",
  daily: "Daily",
  yearly: "Yearly",
};

function ReminderRow({ reminder, tokens }: { reminder: Reminder; tokens: any }) {
  const hourLabel = `${reminder.fireHour}:00`;
  return (
    <TouchableOpacity
      style={[rowStyles.row, { backgroundColor: tokens.bgCard, borderColor: tokens.border }]}
      activeOpacity={0.8}
    >
      <View style={{ flex: 1 }}>
        <Text style={[rowStyles.title, { color: tokens.textPrimary }]}>{reminder.title}</Text>
        <Text style={{ color: tokens.textTertiary, fontSize: 12, marginTop: 2 }}>
          {hourLabel} · {RECURRENCE_LABEL[reminder.recurrence] ?? reminder.recurrence}
          {reminder.fireDate ? ` · ${reminder.fireDate}` : ""}
        </Text>
      </View>
      {reminder.snoozedUntil && (
        <Text style={{ color: tokens.stateBlocked, fontSize: 12 }}>Snoozed</Text>
      )}
    </TouchableOpacity>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  title: { fontSize: 15, fontWeight: "500" },
});

export default function RemindersScreen() {
  const { tokens } = useTheme();
  const store = useStore();

  const standalone = store.reminders.filter((r) => r.taskId === null);
  const taskLinked = store.reminders.filter((r) => r.taskId !== null);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.bgPage }}>
      <View style={[hStyles.header, { borderBottomColor: tokens.border }]}>
        <Text style={[hStyles.heading, { color: tokens.textPrimary }]}>Reminders</Text>
        <TouchableOpacity style={[hStyles.newBtn, { backgroundColor: tokens.accent }]}>
          <Text style={{ color: tokens.accentOn, fontWeight: "600", fontSize: 14 }}>+ New</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {standalone.length > 0 && (
          <>
            <Text style={[hStyles.section, { color: tokens.textSecondary }]}>Standalone</Text>
            {standalone.map((r) => <ReminderRow key={r.id} reminder={r} tokens={tokens} />)}
          </>
        )}
        {taskLinked.length > 0 && (
          <>
            <Text style={[hStyles.section, { color: tokens.textSecondary, marginTop: 16 }]}>Task Reminders</Text>
            {taskLinked.map((r) => <ReminderRow key={r.id} reminder={r} tokens={tokens} />)}
          </>
        )}
        {store.reminders.length === 0 && (
          <Text style={{ color: tokens.textTertiary, textAlign: "center", marginTop: 60 }}>
            No reminders yet
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const hStyles = StyleSheet.create({
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
  section: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
});
