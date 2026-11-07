import { useMemo, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ColorTokens } from "@zakhira/ui";
import {
  CALENDAR_WEEKS,
  buildMonthGrid,
  formatMonthLabel,
  initialCalendarMonth,
  isDateKeyBefore,
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
const CELL_PAD = 3;

const ROW_HEIGHT = PILL + CELL_PAD * 2;

export interface CalendarProps {
  /** Currently chosen day as `YYYY-MM-DD`, or null/"" for none. */
  value: string | null;
  onSelect: (dateKey: string) => void;
  tokens: ColorTokens;
  /**
   * Earliest selectable day, `YYYY-MM-DD`. Days before it render dimmed and
   * do not respond, and the calendar will not page back past its month.
   *
   * Left off, any day is fair game — the restriction belongs to the caller,
   * not to calendars in general. A due date passes today; a date of birth
   * would want the opposite bound.
   */
  minDate?: string;
  /** Today, as a date key. Injectable so a screenshot test can pin it. */
  today?: string;
}

export function Calendar({ value, onSelect, tokens, minDate, today }: CalendarProps) {
  const now = today ?? todayKey();
  // The month the user is looking at. Opens on the chosen date so an existing
  // value is visible without navigating to find it.
  const [view, setView] = useState(() => initialCalendarMonth(value));
  const weeks = useMemo(() => buildMonthGrid(view.year, view.month), [view]);

  const todayMonth = useMemo(() => parseDateKey(now), [now]);
  const onTodayMonth =
    todayMonth !== null && view.year === todayMonth.year && view.month === todayMonth.month;

  // Paging back into a month with nothing selectable in it is a dead end, so
  // the arrow is stopped at the month the minimum falls in.
  const floor = useMemo(() => (minDate ? parseDateKey(minDate) : null), [minDate]);
  const canGoBack =
    floor === null || view.year * 12 + view.month > floor.year * 12 + floor.month;

  /**
   * Tapping a padding day — the dimmed tail of the previous month or head of
   * the next — selects it *and* follows it, so the calendar never shows a
   * selection the user can see but the header disagrees with.
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
          disabled={!canGoBack}
          style={[
            s.navBtn,
            { borderColor: tokens.border, backgroundColor: tokens.bgCard },
            !canGoBack && s.navBtnDisabled,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          accessibilityState={{ disabled: !canGoBack }}
          activeOpacity={0.7}
        >
          <Ionicons
            name="chevron-back"
            size={18}
            color={canGoBack ? tokens.textSecondary : tokens.textTertiary}
          />
        </TouchableOpacity>

        {/* Label and the "Today" return travel together as one centred group,
            so the month name does not jump sideways when the button appears. */}
        <View style={s.headerCenter}>
          <Text style={[s.monthLabel, { color: tokens.textPrimary }]} numberOfLines={1}>
            {formatMonthLabel(view.year, view.month)}
          </Text>
          {/* Shown only when there is somewhere to go back to — on this month
              it would be a button that does nothing. */}
          {!onTodayMonth && todayMonth !== null && (
            <TouchableOpacity
              onPress={() => setView({ year: todayMonth.year, month: todayMonth.month })}
              style={[s.todayBtn, { borderColor: tokens.accent }]}
              accessibilityRole="button"
              accessibilityLabel="Go to this month"
              activeOpacity={0.7}
            >
              <Text style={[s.todayBtnText, { color: tokens.accent }]}>Today</Text>
            </TouchableOpacity>
          )}
        </View>

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
            {week.map((day) => {
              const selected = day.key === value;
              const isToday = day.key === now;
              // A value already saved before the bound existed still shows as
              // chosen; it just cannot be re-picked.
              const blocked = minDate !== undefined && isDateKeyBefore(day.key, minDate);

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
                  disabled={blocked}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled: blocked }}
                  accessibilityLabel={day.key}
                >
                  <View
                    style={[
                      s.pill,
                      selected && { backgroundColor: tokens.accent },
                      // Today is outlined rather than filled, so it stays
                      // legible next to the day that is actually chosen.
                      //
                      // Only the *colour* switches: the width is fixed in
                      // `s.pill`. Taking the border away on update — which is
                      // exactly what selecting today used to do — made Android
                      // recompute the `overflow: hidden` clip and swallow the
                      // digit, leaving a filled pill with no number on it.
                      isToday && !selected && { borderColor: tokens.accent },
                    ]}
                  >
                    <Text
                      style={[
                        s.dayText,
                        { color: textColor },
                        (selected || isToday) && { fontWeight: "700" },
                        // Dimmer than textTertiary alone: the neighbouring
                        // months are context, and must not compete with this
                        // month's days.
                        !day.inMonth && !selected && { opacity: 0.55 },
                        // Fainter still for a day that cannot be chosen, so
                        // "past" reads differently from "another month".
                        blocked && !selected && { color: tokens.textTertiary, opacity: 0.3 },
                      ]}
                    >
                      {day.day}
                    </Text>
                  </View>
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
  // Kept in place rather than hidden: a control that vanishes at the boundary
  // would shift the header and leave you unsure the arrow was ever there.
  navBtnDisabled: { opacity: 0.4 },
  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  monthLabel: { fontSize: 17, fontWeight: "600", flexShrink: 1 },
  todayBtn: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  todayBtnText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
  grid: { height: ROW_HEIGHT * CALENDAR_WEEKS },
  // The M/T/W header deliberately takes a full day-row height: it is what sets
  // the gap between the initials and the first week.
  weekdayRow: { flexDirection: "row", height: ROW_HEIGHT },
  row: { flexDirection: "row", height: ROW_HEIGHT },
  cell: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: CELL_PAD },
  weekday: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6 },
  pill: {
    width: PILL,
    height: PILL,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    // Always bordered, usually invisibly. Every cell therefore has the same
    // content box, so a day does not shift by a pixel and a half when it
    // becomes "today", and the width never changes on a re-render (see the
    // note at the call site — that is what blanked the selected cell).
    // A transparent border still shows the fill beneath it, so a selected
    // day reads as a solid pill, not a ring.
    borderWidth: 1.5,
    borderColor: "transparent",
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
});
