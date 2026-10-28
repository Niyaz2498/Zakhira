import { useState, useEffect, useCallback } from "react";
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import type { Task, TaskState, TaskComment } from "@zakhira/core";
import {
  sortTaskComments,
  formatCommentAge,
  isCommentEdited,
  canCommentOnTask,
  TASK_COMMENT_MAX_LENGTH,
} from "@zakhira/core";
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
  groupName: string;
  tokens: any;
  onClose: () => void;
  onTaskUpdated: (task: Task) => void;
}

export function TaskDetailModal({ task, groupName, tokens, onClose, onTaskUpdated }: Props) {
  const [ct, setCt] = useState<Task | null>(task);
  const [saving, setSaving] = useState(false);
  // Live elapsed seconds computed from ct.timerStartedAt
  const [liveElapsed, setLiveElapsed] = useState(0);

  // ─── Comments ──────────────────────────────────────────────────────────────
  // Comments are not carried by delta sync, so the store has no copy of them:
  // the log is fetched when the task opens and the response is authoritative.
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);

  // Keep ct in sync when the outer task prop changes (e.g. new task opened)
  useEffect(() => {
    setCt(task);
  }, [task?.id]);

  const loadComments = useCallback(async (taskId: string) => {
    const client = getClient();
    if (!client) return;
    setCommentsLoading(true);
    setCommentsError(null);
    try {
      const res = await client.listTaskComments(taskId);
      if (res.ok) setComments(sortTaskComments(res.data));
      else setCommentsError(res.error);
    } catch {
      setCommentsError("Couldn't load comments — check your connection.");
    } finally {
      setCommentsLoading(false);
    }
  }, []);

  // Refetch whenever a different task is opened, and reset any in-flight draft
  // so a half-typed comment can't land on the wrong task.
  useEffect(() => {
    setComments([]);
    setCommentsError(null);
    setDraft("");
    setEditingId(null);
    setEditDraft("");
    if (task?.id) loadComments(task.id);
  }, [task?.id, loadComments]);

  const handleAddComment = useCallback(async () => {
    const body = draft.trim();
    if (!ct || !body) return;
    const client = getClient();
    if (!client) return;
    setCommentBusy(true);
    try {
      const res = await client.createTaskComment(ct.id, { body });
      if (res.ok) {
        setComments((prev) => sortTaskComments([...prev, res.data]));
        setDraft("");
      } else {
        Alert.alert("Couldn't add comment", res.error);
      }
    } catch {
      Alert.alert("Couldn't add comment", "Check your connection and try again.");
    } finally {
      setCommentBusy(false);
    }
  }, [ct, draft]);

  const handleSaveEdit = useCallback(async () => {
    const body = editDraft.trim();
    if (!ct || !editingId || !body) return;
    const client = getClient();
    if (!client) return;
    setCommentBusy(true);
    try {
      const res = await client.updateTaskComment(ct.id, editingId, { body });
      if (res.ok) {
        setComments((prev) =>
          sortTaskComments(prev.map((x) => (x.id === res.data.id ? res.data : x)))
        );
        setEditingId(null);
        setEditDraft("");
      } else {
        Alert.alert("Couldn't save comment", res.error);
      }
    } catch {
      Alert.alert("Couldn't save comment", "Check your connection and try again.");
    } finally {
      setCommentBusy(false);
    }
  }, [ct, editingId, editDraft]);

  const handleDeleteComment = useCallback(
    (comment: TaskComment) => {
      if (!ct) return;
      // The backend deletes the row outright — there is no undo, so confirm.
      Alert.alert("Delete comment?", "This can't be undone.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const client = getClient();
            if (!client) return;
            setCommentBusy(true);
            try {
              const res = await client.deleteTaskComment(ct.id, comment.id);
              if (res.ok) {
                setComments((prev) => prev.filter((x) => x.id !== comment.id));
                if (editingId === comment.id) {
                  setEditingId(null);
                  setEditDraft("");
                }
              } else {
                Alert.alert("Couldn't delete comment", res.error);
              }
            } catch {
              Alert.alert("Couldn't delete comment", "Check your connection and try again.");
            } finally {
              setCommentBusy(false);
            }
          },
        },
      ]);
    },
    [ct, editingId]
  );

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
          <ScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
            // Without this, React Native's default ("never") makes the first tap
            // while the keyboard is open merely dismiss it — so posting a comment
            // would take two taps on "Add comment". This is the modal's first
            // text input, so nothing here relied on the old behaviour.
            keyboardShouldPersistTaps="handled"
          >
            {/* Type + group */}
            <View style={s.metaRow}>
              <Text style={[s.metaText, { color: tierColor }]}>
                {TYPE_ICONS[ct.type]} {TYPE_LABEL[ct.type]}
              </Text>
              <Text style={[s.metaText, { color: tokens.textTertiary }]}>{groupName}</Text>
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

            {/* Comments — the running log, as opposed to Notes above (the brief) */}
            <View style={s.commentsHeader}>
              <Text style={[s.sectionLabel, { color: tokens.textSecondary, marginBottom: 0 }]}>
                Comments{comments.length ? ` (${comments.length})` : ""}
              </Text>
              {commentsLoading && <ActivityIndicator size="small" color={tokens.accent} />}
            </View>

            {/* Composer — hidden once the task is closed, matching the backend's
                TASK_CLOSED rule rather than letting the user type into a reject. */}
            {canCommentOnTask(ct) ? (
              <View style={s.composer}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  multiline
                  maxLength={TASK_COMMENT_MAX_LENGTH}
                  placeholder="Add a comment…"
                  placeholderTextColor={tokens.textTertiary}
                  style={[
                    s.commentInput,
                    { color: tokens.textPrimary, borderColor: tokens.border, backgroundColor: tokens.bgCard },
                  ]}
                />
                <TouchableOpacity
                  onPress={handleAddComment}
                  disabled={commentBusy || !draft.trim()}
                  style={[
                    s.addCommentBtn,
                    {
                      backgroundColor: draft.trim() ? tokens.accent : tokens.bgCard,
                      borderColor: draft.trim() ? tokens.accent : tokens.border,
                      opacity: commentBusy ? 0.6 : 1,
                    },
                  ]}
                  activeOpacity={0.8}
                >
                  <Text
                    style={{
                      color: draft.trim() ? tokens.accentOn : tokens.textTertiary,
                      fontSize: 15,
                      fontWeight: "700",
                    }}
                  >
                    {commentBusy ? "Saving…" : "Add comment"}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={{ color: tokens.textTertiary, fontSize: 12, marginBottom: 14 }}>
                This task is {ct.state === "completed" ? "completed" : "scrapped"} — its comment log
                is locked.
              </Text>
            )}

            {commentsError ? (
              <TouchableOpacity
                onPress={() => loadComments(ct.id)}
                style={[s.commentCard, { backgroundColor: tokens.bgCard, borderColor: "#ef4444" }]}
              >
                <Text style={{ color: "#ef4444", fontSize: 13 }}>{commentsError}</Text>
                <Text style={{ color: tokens.accent, fontSize: 13, fontWeight: "600", marginTop: 6 }}>
                  Tap to retry
                </Text>
              </TouchableOpacity>
            ) : null}

            {!commentsLoading && !commentsError && comments.length === 0 ? (
              <Text style={{ color: tokens.textTertiary, fontSize: 13, marginBottom: 14 }}>
                {canCommentOnTask(ct)
                  ? "No comments yet. Use the box above to record progress."
                  : "No comments were added to this task."}
              </Text>
            ) : null}

            {comments.map((comment) => {
              const isEditing = editingId === comment.id;
              return (
                <View
                  key={comment.id}
                  style={[s.commentCard, { backgroundColor: tokens.bgCard, borderColor: tokens.border }]}
                >
                  <View style={s.commentMetaRow}>
                    <Text style={{ color: tokens.textTertiary, fontSize: 11, fontWeight: "600" }}>
                      {formatCommentAge(comment.createdAt)}
                      {isCommentEdited(comment) ? " · edited" : ""}
                    </Text>
                    {canCommentOnTask(ct) && !isEditing ? (
                      <View style={s.commentActions}>
                        <TouchableOpacity
                          onPress={() => {
                            setEditingId(comment.id);
                            setEditDraft(comment.body);
                          }}
                          disabled={commentBusy}
                          hitSlop={8}
                        >
                          <Text style={{ color: tokens.accent, fontSize: 12, fontWeight: "700" }}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleDeleteComment(comment)}
                          disabled={commentBusy}
                          hitSlop={8}
                        >
                          <Text style={{ color: "#ef4444", fontSize: 12, fontWeight: "700" }}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>

                  {isEditing ? (
                    <>
                      <TextInput
                        value={editDraft}
                        onChangeText={setEditDraft}
                        multiline
                        maxLength={TASK_COMMENT_MAX_LENGTH}
                        autoFocus
                        style={[
                          s.commentInput,
                          { color: tokens.textPrimary, borderColor: tokens.accent, backgroundColor: tokens.bgSurface },
                        ]}
                      />
                      <View style={s.commentEditBtnRow}>
                        <TouchableOpacity
                          onPress={() => {
                            setEditingId(null);
                            setEditDraft("");
                          }}
                          disabled={commentBusy}
                          style={[s.commentBtn, { borderWidth: 1, borderColor: tokens.border }]}
                        >
                          <Text style={{ color: tokens.textSecondary, fontSize: 13, fontWeight: "700" }}>
                            Cancel
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={handleSaveEdit}
                          disabled={commentBusy || !editDraft.trim()}
                          style={[
                            s.commentBtn,
                            {
                              backgroundColor: editDraft.trim() ? tokens.accent : tokens.bgSurface,
                              opacity: commentBusy ? 0.6 : 1,
                            },
                          ]}
                        >
                          <Text
                            style={{
                              color: editDraft.trim() ? tokens.accentOn : tokens.textTertiary,
                              fontSize: 13,
                              fontWeight: "700",
                            }}
                          >
                            Save
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  ) : (
                    <Text style={{ color: tokens.textPrimary, fontSize: 14, lineHeight: 21 }}>
                      {comment.body}
                    </Text>
                  )}
                </View>
              );
            })}

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
  commentsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  commentCard: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 10 },
  commentMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  commentActions: { flexDirection: "row", gap: 16 },
  commentInput: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    fontSize: 14,
    lineHeight: 21,
    minHeight: 80,
    textAlignVertical: "top",
  },
  commentEditBtnRow: { flexDirection: "row", gap: 10, marginTop: 10, justifyContent: "flex-end" },
  commentBtn: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 8 },
  // Sits at the top of the Comments section, above the log, so adding an entry
  // never means scrolling past the whole history to reach the input.
  composer: { marginBottom: 16 },
  addCommentBtn: {
    marginTop: 10,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
