import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { WeekTiles, type DayTileData } from "@/components/MonthCalendar";
import { dayKey, parseDayKey } from "@/domain/calendarGrid";
import {
  colors,
  spacing,
  typography,
  themedStyles,
  useThemeVersion,
} from "@/theme";

/**
 * The date picker at the top of the staff screens: the chosen day's name and
 * date with ‹ Today › under it, then the week as rounded tiles. Just dates -
 * nothing about tasks on it.
 */
export function DateStrip({
  today,
  selectedDate,
  onSelect,
}: {
  today: Date;
  selectedDate: Date;
  onSelect: (date: Date) => void;
}) {
  useThemeVersion();
  const weekKeys = useMemo(
    () => buildDateStrip(selectedDate).map(dayKey),
    [selectedDate],
  );
  const todayKey = dayKey(today);
  const selectedKey = dayKey(selectedDate);
  const selectedLabel = selectedDate.toLocaleDateString("en-ZA", {
    weekday: "long",
  });
  const selectedSubLabel = selectedDate.toLocaleDateString("en-ZA", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const tile = (): DayTileData => ({});

  return (
    <View style={styles.wrap}>
      <View style={styles.labelWrap} accessibilityRole="header">
        <Text style={styles.label} numberOfLines={1}>
          {selectedLabel}
        </Text>
        <Text style={styles.subLabel}>{selectedSubLabel}</Text>
        <View style={styles.controls}>
          <Pressable
            accessibilityLabel="Previous week"
            onPress={() => onSelect(addDays(selectedDate, -7))}
            style={styles.roundButton}
            hitSlop={6}
          >
            <Ionicons name="chevron-back" size={16} color={colors.foreground} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => onSelect(startOfDay(new Date()))}
            style={styles.todayButton}
            hitSlop={6}
          >
            <Text style={styles.todayText}>Today</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Next week"
            onPress={() => onSelect(addDays(selectedDate, 7))}
            style={styles.roundButton}
            hitSlop={6}
          >
            <Ionicons
              name="chevron-forward"
              size={16}
              color={colors.foreground}
            />
          </Pressable>
        </View>
      </View>
      <WeekTiles
        days={weekKeys}
        tile={tile}
        today={todayKey}
        selected={selectedKey}
        onSelect={(key) => onSelect(parseDayKey(key))}
      />
    </View>
  );
}

function buildDateStrip(day: Date) {
  const start = startOfWeek(day);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

function startOfWeek(date: Date) {
  return addDays(date, -date.getDay());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(date.getDate() + days);
  return startOfDay(next);
}

export function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    wrap: { alignSelf: "stretch" },
    labelWrap: { alignItems: "center", marginBottom: spacing.md },
    controls: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      marginTop: spacing.sm,
    },
    roundButton: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    todayButton: {
      paddingHorizontal: spacing.md,
      height: 30,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
    },
    todayText: {
      fontSize: typography.small,
      fontWeight: "700",
      color: colors.primary,
    },
    label: {
      fontSize: typography.h2,
      fontWeight: "800",
      color: colors.foreground,
    },
    subLabel: { fontSize: typography.tiny, color: colors.mutedForeground },
  }),
);
