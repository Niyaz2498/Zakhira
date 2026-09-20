import { useState, useEffect, useCallback } from "react";
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
  const [ct, setCt] = useState<Task | null>(task);
  const [saving, setSaving] = useState(false);
  // Live elapsed seconds computed from ct.timerStartedAt
  const [liveElapsed, setLiveElapsed] = useState(0);

  // Keep ct in sync when the outer task prop changes (e.g. new task opened)
  useEffect(() => {
    setCt(task);
  }, [task?.id]);

  // Drive the live counter from server-side timerStartedAt
  useEffect(() => {
    if (!ct?.timerStartedAt) {
      setLiveElapsed(0);
      return;
    }
    const startMs = new Date(ct.timerStartedAt).getTime();
    setLiveElapsed(Math.floor((Date.now() - startMs) / 1000));
    const id = setInterval(() => {
      setLiveElapsed(Math.floor((Date.now() - startMs) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [ct?.timerStartedAt]);

  const timerRunning = ct?.timerStartedAt != null;
  const displaySeconds = (ct?.timeLogged ?? 0) + liveElapsed;

  const handleTimerStart = useCallback(async () => {
    if (!ct) return;
    setSaving(true);
    try {
      const client = getClient();
      if (!client) return;
      const res = await client.updateTask(ct.id, { timerStartedAt: new Date().toISOString() });
      if (res.ok) {
        setCt(res.data);
        updateTaskInStore(res.data);
        onTaskUpdated(res.data);
      }
    } finally {
      setSaving(false);
    }
  }, [ct, onTaskUpdated]);

  const handleTimerStop = useCallback(async () => {
    if (!ct?.timerStartedAt) return;
    const elapsed = Math.floor((Date.now() - new Date(ct.timerStartedAt).getTime()) / 1000);
    const total = ct.timeLogged + elapsed;
    setSaving(true);
    try {
      const client = getClient();
      if (!client) return;
      const res = await client.updateTask(ct.id, { timeLogged: total, timerStartedAt: null });
      if (res.ok) {
        setCt(res.data);
        updateTaskInStore(res.data);
        onTaskUpdated(res.data);
      }
    } finally {
      setSaving(false);
    }
  }, [ct, onTaskUpdated]);

  const handleTimerReset = useCallback(() => {
    if (!ct) return;
    Alert.alert("Reset timer?", "This will clear all logged time for this task.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset",
        style: "destructive",
        onPress: async () => {
          setSaving(true);
          try {
            const client = getClient();
            if (!client) return;
            const res = await client.updateTask(ct.id, { timeLogged: 0, timerStartedAt: null });
            if (res.ok) {
              setCt(res.data);
              updateTaskInStore(res.data);
              onTaskUpdated(res.data);
            }
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }, [ct, onTaskUpdated]);

  const handleStateChange = useCallback(async (newState: TaskState) => {
    if (!ct || newState === ct.state) return;
    setSaving(true);
    try {
      const client = getClient();
      if (!client) return;
      const res = await client.updateTask(ct.id, { state: newState });
      if (res.ok) {
        setCt(res.data);
        updateTaskInStore(res.data);
        onTaskUpdated(res.data);
      }
    } finally { setSaving(false); }
  }, [ct, onTaskUpdated]);

  const isDone = ct ? (ct.state === "completed" || ct.state === "scrapped") : false;
  const priorityColor = ct?.importance != null ? PRIORITY_COLOR[ct.importance] : null;
  const tierColor = ct
    ? (ct.type === "main" ? tokens.tierMain : ct.type === "side" ? tokens.tierSide : tokens.tierExplore)
    : tokens.accent;
  const currentState = ct ? STATE_OPTIONS.find((s) => s.key === ct.state) : null;

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

        {ct && (
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
            {/* Type + operation */}
            <View style={s.metaRow}>
              <Text style={[s.metaText, { color: tierColor }]}>
                {TYPE_ICONS[ct.type]} {TYPE_LABEL[ct.type]}
              </Text>
              <Text style={[s.metaText, { color: tokens.textTertiary }]}>{opName}</Text>
            </View>

            {/* Title */}
            <Text style={[s.title, { color: tokens.textPrimary }]}>{ct.title}</Text>

            {/* Badges */}
            <View style={s.badgeRow}>
              {currentState && (
                <View style={[s.badge, { backgroundColor: currentState.color + "22", borderColor: currentState.color + "55" }]}>
                  <Text style={[s.badgeText, { color: currentState.color }]}>{currentState.label}</Text>
                </View>
              )}
              {ct.importance != null && (
                <View style={[s.badge, { backgroundColor: priorityColor! + "22", borderColor: priorityColor! + "55" }]}>
                  <Text style={[s.badgeText, { color: priorityColor! }]}>{PRIORITY_LABEL[ct.importance]}</Text>
                </View>
              )}
              {ct.endDate && (
                <View style={[s.badge, { backgroundColor: tokens.bgCard, borderColor: tokens.border }]}>
                  <Text style={[s.badgeText, { color: tokens.textTertiary }]}>Due {ct.endDate}</Text>
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
                        { borderColor: ct.state === opt.key ? opt.color : tokens.border },
                        ct.state === opt.key && { backgroundColor: opt.color + "22" },
                      ]}
                    >
                      <Text style={{ fontSize: 12, fontWeight: "600", color: ct.state === opt.key ? opt.color : tokens.textSecondary }}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* Time Logged */}
            <Text style={[s.sectionLabel, { color: tokens.textSecondary }]}>Time Logged</Text>
            <View style={[s.timeCard, { backgroundColor: tokens.bgCard, borderColor: timerRunning ? tokens.accent : tokens.border }]}>
              <Text style={{ fontSize: 28, fontWeight: "800", color: timerRunning ? tokens.accent : tokens.textPrimary }}>
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
                      style={[s.timerBtn, s.timerBtnStart, { backgroundColor: "#b80000" }]}
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
            {ct.notes ? (
              <>
                <Text style={[s.sectionLabel, { color: tokens.textSecondary }]}>Notes</Text>
                <View style={[s.notesCard, { backgroundColor: tokens.bgCard, borderColor: tokens.border }]}>
                  <Text style={{ color: tokens.textPrimary, fontSize: 14, lineHeight: 22 }}>{ct.notes}</Text>
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
