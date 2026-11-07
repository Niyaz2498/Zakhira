import { useMemo, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ColorTokens } from "@zakhira/ui";
import {
  buildMonthGrid,
  formatMonthLabel,
  initialCalendarMonth,
  parseDateKey,
  shiftMonth,
  todayKey,
} from "@zakhira/core";

/**
 * A month grid. Dates in, a date key out — it stores nothing and talks to no
 * API, so anything in the app that needs a day (a task's due date, a group's,
 * a reminder's anchor, a future agenda screen) can mount it.
 *
 * The grid maths lives in `@zakhira/core` so the desktop calendar lands on the
 * same cells when it arrives; what is here is only how those cells look.
 */

/** Monday-first, matching `buildMonthGrid`. */
const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"];

/** Side of a day cell's highlight. 7 × 40 fits the narrowest phone we target. */
const PILL = 40;
/** Vertical breathing room above and below each cell. */
const CELL_PAD = 2;
/** The "something is due" marker under a day, and its gap from the pill. */
const DOT = 5;
const DOT_GAP = 2;

const ROW_HEIGHT = PILL + DOT_GAP + DOT + CELL_PAD * 2;
/**
 * A month needs at most six rows (31 days that start on a Sunday). The grid is
 * held at that height whatever the month, because the alternative is a sheet
 * that changes height as you page: the arrows and the footer would shift under
 * your finger between a 4-row February and a 6-row November.
 */
const MAX_WEEKS = 6;

export interface CalendarProps {
  /** Currently chosen day as `YYYY-MM-DD`, or null/"" for none. */
  value: string | null;
  onSelect: (dateKey: string) => void;
  tokens: ColorTokens;
  /**
   * Days to mark with a dot — in the task form, work that is already due then.
   * The dot is information, not a restriction: marked days select like any
   * other.
   */
  markedDates?: readonly string[];
  /** Today, as a date key. Injectable so a screenshot test can pin it. */
  today?: string;
}

export function Calendar({ value, onSelect, tokens, markedDates, today }: CalendarProps) {
  const now = today ?? todayKey();
  // The month the user is looking at. Opens on the chosen date so an existing
  // value is visible without navigating to find it.
  const [view, setView] = useState(() => initialCalendarMonth(value));
  const weeks = useMemo(() => buildMonthGrid(view.year, view.month), [view]);
  const marks = useMemo(() => new Set(markedDates ?? []), [markedDates]);

  /**
   * Tapping a lead-in day (the greyed tail of the previous month) selects it
   * *and* follows it, so the calendar never shows a selection the user can see
   * but the header disagrees with.
   */
  function select(dateKey: string, inMonth: boolean) {
    if (!inMonth) {
      const parts = parseDateKey(dateKey);
      if (parts) setView({ year: parts.year, month: parts.month });
    }
    onSelect(dateKey);
  }

  return (
    <View>
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => setView(shiftMonth(view.year, view.month, -1))}
          style={[s.navBtn, { borderColor: tokens.border, backgroundColor: tokens.bgCard }]}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={18} color={tokens.textSecondary} />
        </TouchableOpacity>

        <Text style={[s.monthLabel, { color: tokens.textPrimary }]}>
          {formatMonthLabel(view.year, view.month)}
        </Text>

        <TouchableOpacity
          onPress={() => setView(shiftMonth(view.year, view.month, 1))}
          style={[s.navBtn, { borderColor: tokens.border, backgroundColor: tokens.bgCard }]}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-forward" size={18} color={tokens.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={s.weekdayRow}>
        {WEEKDAY_INITIALS.map((initial, i) => (
          <View key={i} style={s.cell}>
            <Text style={[s.weekday, { color: tokens.textTertiary }]}>{initial}</Text>
          </View>
        ))}
      </View>

      <View style={s.grid}>
        {weeks.map((week, w) => (
          <View key={w} style={s.row}>
            {week.map((day, d) => {
              // Blank tail cells keep the final row's columns aligned.
              if (!day) return <View key={`blank-${d}`} style={s.cell} />;

              const selected = day.key === value;
              const isToday = day.key === now;
              const marked = marks.has(day.key);

              const textColor = selected
                ? tokens.accentOn
                : isToday
                  ? tokens.accent
                  : day.inMonth
                    ? tokens.textPrimary
                    : tokens.textTertiary;

              return (
                <TouchableOpacity
                  // Keyed by date, not by column. With an index key, changing
                  // month reuses each host view for a different day, and the
                  // cell that had been "today" came back blank — a real day
                  // you could tap but not read. A date key remounts instead.
                  key={day.key}
                  style={s.cell}
                  onPress={() => select(day.key, day.inMonth)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={day.key}
                >
                  <View
                    style={[
                      s.pill,
                      selected && { backgroundColor: tokens.accent },
                      // Today is outlined rather than filled, so it stays
                      // legible next to the day that is actually chosen.
                      isToday && !selected && { borderWidth: 1.5, borderColor: tokens.accent },
                    ]}
                  >
                    <Text
                      style={[
                        s.dayText,
                        { color: textColor },
                        (selected || isToday) && { fontWeight: "700" },
                        // Dimmer than textTertiary alone: last month's days
                        // are context, and must not compete with this month's.
                        !day.inMonth && !selected && { opacity: 0.55 },
                      ]}
                    >
                      {day.day}
                    </Text>
                  </View>
                  {/* Always rendered, transparent when unmarked, so a dot
                      appearing never shifts the row. It sits *below* the pill,
                      on the sheet — so it takes the accent when selected, not
                      `accentOn`: that token is for ink on an accent fill and
                      is near-invisible against the sheet in both themes. */}
                  <View
                    style={[
                      s.dot,
                      marked && {
                        backgroundColor: selected ? tokens.accent : tokens.textTertiary,
                      },
                    ]}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  navBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  monthLabel: { fontSize: 17, fontWeight: "600" },
  grid: { minHeight: ROW_HEIGHT * MAX_WEEKS },
  // The M/T/W header deliberately takes a full day-row height: it is what sets
  // the gap between the initials and the first week.
  weekdayRow: { flexDirection: "row", height: ROW_HEIGHT },
  row: { flexDirection: "row", height: ROW_HEIGHT },
  cell: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: CELL_PAD },
  weekday: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    paddingVertical: 8,
  },
  pill: {
    width: PILL,
    height: PILL,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    // Both of these are load-bearing on Android, and the symptom is visible:
    // a cell that gains its fill on re-render (i.e. the day you just tapped)
    // draws as a hard-cornered square while the cell selected at mount draws
    // rounded. Declaring the background up front means the drawable — and its
    // radius — already exists when the colour changes; `overflow` makes the
    // clip stick.
    backgroundColor: "transparent",
    overflow: "hidden",
  },
  dayText: { fontSize: 15 },
  // `overflow` for the same Android reason as `pill`: a dot that gains its
  // colour on re-render draws as a square without it.
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    marginTop: DOT_GAP,
    backgroundColor: "transparent",
    overflow: "hidden",
  },
});
