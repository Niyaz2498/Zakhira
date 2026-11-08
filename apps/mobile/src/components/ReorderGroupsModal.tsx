import { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Animated,
  PanResponder,
  ActivityIndicator,
  Alert,
} from "react-native";
import { computeGroupStats, moveInList, reorderableGroups } from "@zakhira/core";
import type { Group, Task } from "@zakhira/core";
import { getClient, updateGroupInStore } from "../store";

/**
 * Row geometry. The drag maths turns a finger offset into a number of rows by
 * dividing by `SLOT`, so every row must be exactly `ROW_HEIGHT` tall — which
 * is why a row is given a fixed height rather than sizing to its content, and
 * why its subtitle is capped at one line.
 */
const ROW_HEIGHT = 56;
const ROW_GAP = 10;
const SLOT = ROW_HEIGHT + ROW_GAP;

/**
 * How many slots a drag of `dy` pixels has travelled. Rounding at the halfway
 * point is what makes a row swap as soon as it visually passes its neighbour,
 * rather than only once it has fully cleared it.
 */
function slotsMoved(dy: number): number {
  return Math.round(dy / SLOT);
}

// ── Drag handle ───────────────────────────────────────────────────────────────

/**
 * The grip, and the only part of a row that drags.
 *
 * Confining the gesture to the handle is what lets the list scroll normally:
 * the handle claims the touch on *contact* (`onStartShouldSetPanResponder`),
 * so the ScrollView never becomes the responder and there is no mid-gesture
 * hand-off to lose. Dragging anywhere on the row was tried first and the row
 * stayed put — the ScrollView had already claimed the touch and would not
 * give it up once it had it.
 *
 * Its own component because each handle needs a PanResponder bound to its own
 * row index, and hooks cannot be called from inside a `.map`.
 */
function DragHandle({ index, tokens, active, onGrant, onMove, onRelease }: {
  index: number;
  tokens: any;
  active: boolean;
  onGrant: (index: number) => void;
  onMove: (dy: number) => void;
  onRelease: () => void;
}) {
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => onGrant(index),
        onPanResponderMove: (_e, g) => onMove(g.dy),
        onPanResponderRelease: onRelease,
        onPanResponderTerminate: onRelease,
      }),
    [index, onGrant, onMove, onRelease]
  );

  return (
    <View
      {...responder.panHandlers}
      // Padded out to a thumb-sized target; the glyph itself is ~16px.
      style={s.handle}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Text style={{ color: active ? tokens.accent : tokens.textTertiary, fontSize: 18 }}>
        ☰
      </Text>
    </View>
  );
}

// ── The modal ─────────────────────────────────────────────────────────────────

export function ReorderGroupsModal({ visible, groups, tasks, tokens, onClose }: {
  visible: boolean;
  groups: Group[];
  tasks: Task[];
  tokens: any;
  onClose: () => void;
}) {
  // The working copy, seeded once per open (the modal is mounted only while
  // open). Nothing writes to it but the drag, so a sync landing mid-gesture
  // cannot reshuffle the list under the finger.
  const [order, setOrder] = useState<Group[]>(() => reorderableGroups(groups));
  const [saving, setSaving] = useState(false);

  const pinned = useMemo(() => groups.find((g) => g.isDefault) ?? null, [groups]);

  // Gesture state is mirrored into refs because a PanResponder closes over its
  // callbacks once: reading plain state inside a gesture would see the values
  // as they stood when the responder was built, not as they are now.
  const [heldIndex, setHeldIndex] = useState<number | null>(null);
  const heldIndexRef = useRef<number | null>(null);
  const [shift, setShift] = useState(0);
  const shiftRef = useRef(0);

  const orderRef = useRef(order);
  orderRef.current = order;

  const dragY = useRef(new Animated.Value(0)).current;

  // Stable identities, so a handle's PanResponder is rebuilt only when its own
  // index changes rather than on every render.
  const handleGrant = useCallback((index: number) => {
    heldIndexRef.current = index;
    shiftRef.current = 0;
    setHeldIndex(index);
    setShift(0);
    dragY.setValue(0);
  }, [dragY]);

  const handleMove = useCallback((dy: number) => {
    const from = heldIndexRef.current;
    if (from === null) return;
    dragY.setValue(dy);
    // Clamped so a row cannot be dragged off either end of the list.
    const target = Math.max(
      0,
      Math.min(orderRef.current.length - 1, from + slotsMoved(dy))
    );
    if (target - from !== shiftRef.current) {
      shiftRef.current = target - from;
      setShift(shiftRef.current);
    }
  }, [dragY]);

  const handleRelease = useCallback(() => {
    const from = heldIndexRef.current;
    if (from !== null && shiftRef.current !== 0) {
      setOrder((prev) => moveInList(prev, from, from + shiftRef.current));
    }
    heldIndexRef.current = null;
    shiftRef.current = 0;
    setHeldIndex(null);
    setShift(0);
    dragY.setValue(0);
  }, [dragY]);

  /**
   * Where a row sits relative to its resting place while a drag is in flight.
   * The held row follows the finger; every row between its old slot and its
   * new one steps one slot the other way, which is what opens the gap the row
   * will drop into.
   */
  function restingShift(index: number): number {
    if (heldIndex === null || shift === 0) return 0;
    const to = heldIndex + shift;
    if (index === heldIndex) return 0; // positioned by dragY instead
    if (heldIndex < to && index > heldIndex && index <= to) return -SLOT;
    if (heldIndex > to && index < heldIndex && index >= to) return SLOT;
    return 0;
  }

  async function handleDone() {
    const before = reorderableGroups(groups).map((g) => g.id).join();
    const after = order.map((g) => g.id);
    // Nothing moved — don't spend a request, and don't bump every group's
    // updatedAt, which would drag the whole list through the next delta sync.
    if (after.join() === before) { onClose(); return; }

    setSaving(true);
    try {
      const client = getClient();
      if (!client) return;
      const res = await client.reorderGroups(after);
      if (!res.ok) { Alert.alert("Error", res.error); return; }
      for (const g of res.data) updateGroupInStore(g);
      onClose();
    } catch {
      Alert.alert("Error", "Could not save the new order.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: tokens.bgPage }}>
        <View style={[s.header, { borderBottomColor: tokens.border, backgroundColor: tokens.bgSurface }]}>
          <TouchableOpacity onPress={onClose} disabled={saving}>
            <Text style={{ color: tokens.textSecondary, fontSize: 16 }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={{ color: tokens.textPrimary, fontSize: 17, fontWeight: "600" }}>
            Reorder groups
          </Text>
          <TouchableOpacity onPress={handleDone} disabled={saving}>
            {saving
              ? <ActivityIndicator size="small" color={tokens.accent} />
              : <Text style={{ color: tokens.accent, fontSize: 16, fontWeight: "600" }}>Done</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <Text style={{ color: tokens.textSecondary, fontSize: 13, marginBottom: 20 }}>
            Drag the ☰ handles to set the order on your Groups page.
          </Text>

          {pinned && (
            <>
              <Text style={[s.sectionLabel, { color: tokens.textTertiary }]}>Pinned</Text>
              <View style={[s.row, s.pinnedRow, { borderColor: tokens.border }]}>
                <Text style={{ color: tokens.textTertiary, fontSize: 15, marginRight: 10 }}>🔒</Text>
                <Text style={{ flex: 1, color: tokens.textPrimary, fontSize: 15, fontWeight: "600" }}>
                  {pinned.name}
                </Text>
                <Text style={{ color: tokens.textTertiary, fontSize: 12 }}>Always first</Text>
              </View>
            </>
          )}

          <Text style={[s.sectionLabel, { color: tokens.textTertiary, marginTop: pinned ? 20 : 0 }]}>
            Your groups
          </Text>

          {order.length === 0 && (
            <Text style={{ color: tokens.textTertiary, fontSize: 13 }}>
              Nothing to reorder yet — top-level groups appear here once you add some.
            </Text>
          )}

          {order.map((group, index) => {
            const held = heldIndex === index;
            const subCount = groups.filter((g) => g.parentId === group.id).length;
            const stats = computeGroupStats(group.id, groups, tasks);

            return (
              <Animated.View
                key={group.id}
                style={[
                  s.row,
                  {
                    borderColor: held ? tokens.accent : tokens.border,
                    backgroundColor: tokens.bgCard,
                    transform: [{ translateY: held ? dragY : restingShift(index) }],
                    // The lifted row renders above its neighbours so it is
                    // never clipped by the one it is passing.
                    zIndex: held ? 10 : 1,
                    elevation: held ? 6 : 0,
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{ color: tokens.textPrimary, fontSize: 15, fontWeight: "600" }}
                    numberOfLines={1}
                  >
                    {group.name}
                  </Text>
                  {subCount > 0 ? (
                    <Text style={{ color: tokens.textTertiary, fontSize: 12, marginTop: 2 }}>
                      {subCount} sub-group{subCount !== 1 ? "s" : ""}
                    </Text>
                  ) : stats.totalMain > 0 ? (
                    <Text style={{ color: tokens.textTertiary, fontSize: 12, marginTop: 2 }}>
                      {stats.completedMain}/{stats.totalMain} main quests
                    </Text>
                  ) : null}
                </View>
                {group.importance != null && (
                  <Text style={{ color: tokens.accent, fontSize: 13 }}>
                    {"★".repeat(Math.min(group.importance, 5))}
                  </Text>
                )}
                <DragHandle
                  index={index}
                  tokens={tokens}
                  active={held}
                  onGrant={handleGrant}
                  onMove={handleMove}
                  onRelease={handleRelease}
                />
              </Animated.View>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 52, paddingBottom: 14, borderBottomWidth: 1,
  },
  sectionLabel: {
    fontSize: 11, fontWeight: "700", textTransform: "uppercase",
    letterSpacing: 0.6, marginBottom: 10,
  },
  row: {
    height: ROW_HEIGHT,
    marginBottom: ROW_GAP,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  handle: {
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  pinnedRow: { borderStyle: "dashed", paddingRight: 14 },
});
