import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, Pressable, Modal, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { ColorTokens } from "@zakhira/ui";
import { formatDateKeyLong, isValidDateKey } from "@zakhira/core";
import { Calendar } from "./Calendar";

/**
 * Picking a date, in the two pieces a form needs:
 *
 * - `DatePickerSheet` — the calendar on a bottom sheet, for anywhere that
 *   already has its own trigger (a badge in the task modal, a row in the
 *   reminder form).
 * - `DateField` — the labelled field for a create/edit form, which owns a
 *   sheet of its own. This is the drop-in replacement for a `YYYY-MM-DD`
 *   `TextInput`: it speaks the same `string` value, so nothing downstream of
 *   it changes.
 *
 * Both are theme-driven — every colour comes from the caller's tokens, so the
 * sheet follows the Ink & Amber / Sage & Brass switch with the rest of the app.
 */

// ── Bottom sheet ─────────────────────────────────────────────────────────────

export interface DatePickerSheetProps {
  visible: boolean;
  /** `YYYY-MM-DD`, or "" / null for no date. */
  value: string | null;
  /** Fires on "Set date" with the chosen key, and on "Clear" with "". */
  onChange: (dateKey: string) => void;
  onClose: () => void;
  tokens: ColorTokens;
  /** Days to dot — e.g. other work already due. */
  markedDates?: readonly string[];
}

export function DatePickerSheet({
  visible,
  value,
  onChange,
  onClose,
  tokens,
  markedDates,
}: DatePickerSheetProps) {
  const insets = useSafeAreaInsets();
  // The choice is held locally until "Set date": tapping around the calendar
  // must not write to the form, or dismissing the sheet would silently commit
  // whatever the finger last landed on.
  const [draft, setDraft] = useState(value ?? "");

  // Re-opening starts from what the form currently holds, not from the stale
  // draft of the last visit.
  useEffect(() => {
    if (visible) setDraft(value ?? "");
  }, [visible, value]);

  const canSet = draft !== "";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={sheetStyles.root}>
        {/* Tapping away dismisses without committing the draft. */}
        <Pressable style={sheetStyles.backdrop} onPress={onClose} accessibilityLabel="Dismiss" />

        <View
          style={[
            sheetStyles.sheet,
            {
              backgroundColor: tokens.bgSurface,
              borderColor: tokens.border,
              paddingBottom: 16 + insets.bottom,
            },
          ]}
        >
          <View style={[sheetStyles.grabber, { backgroundColor: tokens.borderStrong }]} />

          {/* Keyed on the sheet's value so each opening rebuilds the grid on
              the month of the current date rather than wherever the user
              browsed to last time. */}
          <Calendar
            key={value ?? ""}
            value={draft || null}
            onSelect={setDraft}
            tokens={tokens}
            markedDates={markedDates}
          />

          <View style={sheetStyles.footer}>
            <TouchableOpacity
              onPress={() => {
                onChange("");
                onClose();
              }}
              style={[
                sheetStyles.btn,
                sheetStyles.clearBtn,
                { borderColor: tokens.border, backgroundColor: tokens.bgCard },
              ]}
              activeOpacity={0.8}
            >
              <Text style={[sheetStyles.btnText, { color: tokens.textSecondary }]}>Clear</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                onChange(draft);
                onClose();
              }}
              disabled={!canSet}
              style={[
                sheetStyles.btn,
                sheetStyles.setBtn,
                {
                  backgroundColor: canSet ? tokens.accent : tokens.bgCard,
                  borderColor: canSet ? tokens.accent : tokens.border,
                },
              ]}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  sheetStyles.btnText,
                  { color: canSet ? tokens.accentOn : tokens.textTertiary },
                ]}
              >
                Set date
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  footer: { flexDirection: "row", gap: 12, marginTop: 18 },
  btn: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  clearBtn: { flex: 1 },
  setBtn: { flex: 2 },
  btnText: { fontSize: 16, fontWeight: "700" },
});

// ── Form field ───────────────────────────────────────────────────────────────

export interface DateFieldProps {
  /** Uppercase form label. Omit to render the control on its own. */
  label?: string;
  /** `YYYY-MM-DD`, or "" for unset. */
  value: string;
  onChange: (dateKey: string) => void;
  tokens: ColorTokens;
  markedDates?: readonly string[];
  placeholder?: string;
}

export function DateField({
  label,
  value,
  onChange,
  tokens,
  markedDates,
  placeholder = "No date set",
}: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const hasValue = value !== "";

  return (
    <>
      {label ? <Text style={[fieldStyles.label, { color: tokens.textSecondary }]}>{label}</Text> : null}

      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={[
          fieldStyles.field,
          { backgroundColor: tokens.bgCard, borderColor: hasValue ? tokens.accent : tokens.border },
        ]}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={label ? `${label}: ${hasValue ? value : "not set"}` : undefined}
      >
        <Ionicons
          name="calendar-outline"
          size={18}
          color={hasValue ? tokens.accent : tokens.textTertiary}
        />
        <Text
          style={[
            fieldStyles.value,
            { color: hasValue ? tokens.textPrimary : tokens.textTertiary },
          ]}
          numberOfLines={1}
        >
          {/* A value typed by hand before the picker existed may not be a real
              date; show it as-is rather than hiding it behind a parse error. */}
          {hasValue
            ? isValidDateKey(value)
              ? formatDateKeyLong(value)
              : value
            : placeholder}
        </Text>
        {hasValue ? (
          <TouchableOpacity
            onPress={() => onChange("")}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Clear date"
          >
            <Ionicons name="close-circle" size={18} color={tokens.textTertiary} />
          </TouchableOpacity>
        ) : (
          <Ionicons name="chevron-down" size={16} color={tokens.textTertiary} />
        )}
      </TouchableOpacity>

      <DatePickerSheet
        visible={open}
        value={value}
        onChange={onChange}
        onClose={() => setOpen(false)}
        tokens={tokens}
        markedDates={markedDates}
      />
    </>
  );
}

const fieldStyles = StyleSheet.create({
  label: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  // Mirrors the `cm.input` text fields it sits beside in the task form.
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
  },
  value: { flex: 1, fontSize: 15 },
});
