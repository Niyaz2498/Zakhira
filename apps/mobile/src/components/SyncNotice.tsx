import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { describeSyncState } from "@zakhira/core";
import { clearRejection, sync } from "../store";
import { useStore } from "../store/useStore";

// ─── Saying where the data stands ────────────────────────────────────────────
//
// The app works without a connection, which is only reassuring if it says so.
// Silence would be worse than an error: a task that was typed, accepted and
// then never mentioned again is indistinguishable from a task that was lost.
//
// So there are exactly three things worth saying, and nothing is said when
// everything is already on the server:
//
//   - changes are waiting to go out, and how many;
//   - the server cannot be reached and these rows are the saved copy;
//   - the server refused a change, which no amount of retrying will fix.

/**
 * A strip above the content. Renders nothing when there is nothing to report,
 * so screens can mount it unconditionally.
 */
export function SyncNotice({ tokens }: { tokens: any }) {
  const store = useStore();

  if (store.rejection) {
    return (
      <View style={[s.bar, { backgroundColor: "#ef444422", borderColor: "#ef444455" }]}>
        <Text style={[s.text, { color: "#ef4444" }]} numberOfLines={2}>
          A change could not be saved: {store.rejection}
        </Text>
        <TouchableOpacity onPress={clearRejection} hitSlop={8}>
          <Text style={[s.action, { color: "#ef4444" }]}>Dismiss</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const pending = store.pending.length;
  if (pending === 0 && store.online) return null;

  return (
    <View style={[s.bar, { backgroundColor: tokens.bgCard, borderColor: tokens.border }]}>
      <Text style={[s.text, { color: tokens.textSecondary }]} numberOfLines={1}>
        {describeSyncState(pending, store.online, store.lastSyncedAt)}
      </Text>
      {!store.syncing && (
        <TouchableOpacity onPress={() => void sync()} hitSlop={8}>
          <Text style={[s.action, { color: tokens.accent }]}>Retry</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/**
 * The mark on a row whose change has not reached the server.
 *
 * Deliberately quiet — a hollow ring, not a warning. The task is real and the
 * user is not being asked to do anything about it; the ring is there so that
 * "did that save?" has an answer on the row itself.
 */
export function PendingBadge({ tokens, label }: { tokens: any; label?: boolean }) {
  return (
    <View style={s.badge}>
      <View style={[s.ring, { borderColor: tokens.accent }]} />
      {label && (
        <Text style={[s.badgeText, { color: tokens.accent }]}>Not synced</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderBottomWidth: 1,
  },
  text: { flex: 1, fontSize: 12, fontWeight: "600" },
  action: { fontSize: 12, fontWeight: "700", letterSpacing: 0.3 },
  badge: { flexDirection: "row", alignItems: "center", gap: 5 },
  ring: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5 },
  badgeText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },
});
