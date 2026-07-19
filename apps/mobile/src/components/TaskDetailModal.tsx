import { useState, useEffect, useRef, useCallback } from "react";
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import type { Task, TaskState } from "@zakhira/core";
import { getClient, updateTaskInStore } from "../store";

const TYPE_ICONS: Record<string, string> = { main: "⚔", side: "📍", exploration: "⚗" };
const TYPE_LABEL: Record<string, string> = { main: "Main Quest", side: "Side Quest", exploration: "Exploration" };
const PRIORITY_LABEL: Record<number, string> = { 1: "Low", 2: "Medium", 3: "High" };
const PRIORITY_COLOR: Record<number, string> = { 1: "#5aa9f0", 2: "#f59e0b", 3: "#ef4444" };

const STATE_OPTIONS: { key: TaskState; label: string; color: string }[] = [
  { key: "todo",        label: "To-Do",       color: "#64748b" },
  { key: "in_progress", label: "In Progress", color: "#3b82f6" },
  { key: "blocked",     label: "Blocked",     color: "#f59e0b" },
  { key: "completed",   label: "Completed",   color: "#22c55e" },
  { key: "scrapped",    label: "Scrapped",    color: "#475569" },
];

function formatTime(seconds: number): string {
  if (seconds === 0) return "0s";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`, s && `${s}s`].filter(Boolean).join(" ");
}

interface Props {
  task: Task | null;
  opName: string;
  tokens: any;
  onClose: () => void;
  onTaskUpdated: (task: Task) => void;
}

export function TaskDetailModal({ task, opName, tokens, onClose, onTaskUpdated }: Props) {
  const [saving, setSaving] = useState(false);
  const [timerRunning, setTimerRunning] = useState(false);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [lockedTotal, setLockedTotal] = useState<number | null>(null);
  const sessionStartRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (task) {
      setTimerRunning(false);
      setSessionSeconds(0);
      setLockedTotal(null);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  }, [task?.id]);

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const handleTimerStart = useCallback(() => {
    sessionStartRef.current = Date.now() - sessionSeconds * 1000;
    intervalRef.current = setInterval(() => {
      setSessionSeconds(Math.floor((Date.now() - sessionStartRef.current) / 1000));
    }, 1000);
    setTimerRunning(true);
  }, [sessionSeconds]);

  const handleTimerStop = useCallback(async () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setTimerRunning(false);
    if (!task) return;
    const elapsed = sessionSeconds;
    const total = (task.timeLogged ?? 0) + elapsed;
    setLockedTotal(total); // freeze display during save
    setSessionSeconds(0);  // reset session so next start is fresh
    setSaving(true);
    try {
      const client = getClient();
      if (!client) return;
      const res = await client.updateTask(task.id, { timeLogged: total });
      if (res.ok) { updateTaskInStore(res.data); onTaskUpdated(res.data); }
    } finally {
      setSaving(false);
      setLockedTotal(null); // release — task.timeLogged now reflects total
    }
  }, [task, sessionSeconds, onTaskUpdated]);

  const handleTimerReset = useCallback(() => {
    Alert.alert("Reset timer?", "This will clear all logged time for this task.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset",
        style: "destructive",
        onPress: async () => {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setTimerRunning(false);
          setSessionSeconds(0);
          setLockedTotal(0);
          if (!task) return;
          setSaving(true);
          try {
            const client = getClient();
            if (!client) return;
            const res = await client.updateTask(task.id, { timeLogged: 0 });
            if (res.ok) { updateTaskInStore(res.data); onTaskUpdated(res.data); }
          } finally {
            setSaving(false);
            setLockedTotal(null);
          }
        },
      },
    ]);
  }, [task, onTaskUpdated]);

  const handleStateChange = useCallback(async (newState: TaskState) => {
    if (!task || newState === task.state) return;
    setSaving(true);
    try {
      const client = getClient();
      if (!client) return;
      const res = await client.updateTask(task.id, { state: newState });
      if (res.ok) { updateTaskInStore(res.data); onTaskUpdated(res.data); }
    } finally { setSaving(false); }
  }, [task, onTaskUpdated]);

  const isDone = task ? (task.state === "completed" || task.state === "scrapped") : false;
  const displaySeconds = lockedTotal !== null ? lockedTotal : (task?.timeLogged ?? 0) + sessionSeconds;
  const priorityColor = task?.importance != null ? PRIORITY_COLOR[task.importance] : null;
  const tierColor = task
    ? (task.type === "main" ? tokens.tierMain : task.type === "side" ? tokens.tierSide : tokens.tierExplore)
    : tokens.accent;
  const currentState = task ? STATE_OPTIONS.find((s) => s.key === task.state) : null;

  return (
    <Modal
      visible={task !== null}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={[s.root, { backgroundColor: tokens.bgPage }]}>
        {/* Header */}
        <View style={[s.header, { borderBottomColor: tokens.border, backgroundColor: tokens.bgSurface }]}>
          <TouchableOpacity onPress={onClose} style={s.closeBtn}>
            <Text style={{ color: tokens.accent, fontSize: 16, fontWeight: "600" }}>✕ Close</Text>
          </TouchableOpacity>
          {saving && <ActivityIndicator size="small" color={tokens.accent} />}
        </View>

        {task && (
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
            {/* Type + operation */}
            <View style={s.metaRow}>
              <Text style={[s.metaText, { color: tierColor }]}>
                {TYPE_ICONS[task.type]} {TYPE_LABEL[task.type]}
              </Text>
              <Text style={[s.metaText, { color: tokens.textTertiary }]}>{opName}</Text>
            </View>

            {/* Title */}
            <Text style={[s.title, { color: tokens.textPrimary }]}>{task.title}</Text>

            {/* Badges */}
            <View style={s.badgeRow}>
              {currentState && (
                <View style={[s.badge, { backgroundColor: currentState.color + "22", borderColor: currentState.color + "55" }]}>
                  <Text style={[s.badgeText, { color: currentState.color }]}>{currentState.label}</Text>
                </View>
              )}
              {task.importance != null && (
                <View style={[s.badge, { backgroundColor: priorityColor! + "22", borderColor: priorityColor! + "55" }]}>
                  <Text style={[s.badgeText, { color: priorityColor! }]}>{PRIORITY_LABEL[task.importance]}</Text>
                </View>
              )}
              {task.endDate && (
                <View style={[s.badge, { backgroundColor: tokens.bgCard, borderColor: tokens.border }]}>
                  <Text style={[s.badgeText, { color: tokens.textTertiary }]}>Due {task.endDate}</Text>
                </View>
              )}
            </View>

            {/* Status picker — hidden for completed/scrapped tasks */}
            {!isDone && (
              <>
                <Text style={[s.sectionLabel, { color: tokens.textSecondary }]}>Status</Text>
                <View style={s.stateGrid}>
                  {STATE_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.key}
                      onPress={() => handleStateChange(opt.key)}
                      disabled={saving}
                      style={[
                        s.stateBtn,
                        { borderColor: task.state === opt.key ? opt.color : tokens.border },
                        task.state === opt.key && { backgroundColor: opt.color + "22" },
                      ]}
                    >
                      <Text style={{ fontSize: 12, fontWeight: "600", color: task.state === opt.key ? opt.color : tokens.textSecondary }}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* Time Logged */}
            <Text style={[s.sectionLabel, { color: tokens.textSecondary }]}>Time Logged</Text>
            <View style={[s.timeCard, { backgroundColor: tokens.bgCard, borderColor: tokens.border }]}>
              <Text style={{ fontSize: 28, fontWeight: "800", color: tokens.textPrimary }}>
                {formatTime(displaySeconds)}
              </Text>
              {!isDone && (
                <View style={s.timerBtnRow}>
                  {!timerRunning ? (
                    <TouchableOpacity
                      style={[s.timerBtn, s.timerBtnStart, { backgroundColor: tokens.accent }]}
                      onPress={handleTimerStart}
                      disabled={saving}
                      activeOpacity={0.8}
                    >
                      <Text style={[s.timerBtnText, { color: tokens.accentOn }]}>▶  Start</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[s.timerBtn, s.timerBtnStart, { backgroundColor: "#2563eb" }]}
                      onPress={handleTimerStop}
                      disabled={saving}
                      activeOpacity={0.8}
                    >
                      <Text style={[s.timerBtnText, { color: "#fff" }]}>⏹  Stop</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[s.timerBtn, { borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.bgSurface }]}
                    onPress={handleTimerReset}
                    disabled={saving || timerRunning}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.timerBtnText, { color: saving || timerRunning ? tokens.textTertiary : tokens.textSecondary }]}>
                      ↺  Reset
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Notes */}
            {task.notes ? (
              <>
                <Text style={[s.sectionLabel, { color: tokens.textSecondary }]}>Notes</Text>
                <View style={[s.notesCard, { backgroundColor: tokens.bgCard, borderColor: tokens.border }]}>
                  <Text style={{ color: tokens.textPrimary, fontSize: 14, lineHeight: 22 }}>{task.notes}</Text>
                </View>
              </>
            ) : null}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 52,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  closeBtn: { padding: 4 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  metaText: { fontSize: 12, fontWeight: "600" },
  title: { fontSize: 22, fontWeight: "700", lineHeight: 30, marginBottom: 14 },
  badgeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 24 },
  badge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
  sectionLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 },
  stateGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 24 },
  stateBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  timeCard: { borderRadius: 12, borderWidth: 1, padding: 20, marginBottom: 24, alignItems: "center" },
  timerBtnRow: { flexDirection: "row", gap: 12, marginTop: 16 },
  timerBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  timerBtnStart: { flex: 2 },
  timerBtnText: { fontSize: 15, fontWeight: "700", letterSpacing: 0.3 },
  notesCard: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 24 },
});
