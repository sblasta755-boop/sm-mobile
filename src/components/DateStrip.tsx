import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, typography } from "@/theme";

export function DateStrip() {
  const today = useMemo(() => startOfDay(new Date()), []);
  const [selectedDate, setSelectedDate] = useState(today);
  const weekDays = useMemo(() => buildDateStrip(selectedDate), [selectedDate]);
  const selectedLabel = selectedDate.toLocaleDateString("en-ZA", { weekday: "long" });
  const selectedSubLabel = selectedDate.toLocaleDateString("en-ZA", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <View style={styles.wrap}>
      <View style={styles.labelWrap}>
        <Text style={styles.label} numberOfLines={1}>
          {selectedLabel}
        </Text>
        <Text style={styles.subLabel}>{selectedSubLabel}</Text>
      </View>

      <View style={styles.row}>
        <Pressable
          accessibilityLabel="Previous dates"
          onPress={() => setSelectedDate((date) => addDays(date, -1))}
          style={styles.arrow}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={16} color={colors.mutedForeground} />
        </Pressable>

        <View style={styles.days}>
          {weekDays.map((date) => {
            const isSelected = isSameDay(date, selectedDate);
            const isToday = isSameDay(date, today);
            return (
              <Pressable
                key={date.toISOString()}
                onPress={() => setSelectedDate(date)}
                style={styles.day}
                accessibilityState={{ selected: isSelected }}
              >
                <Text style={styles.dayLetter}>
                  {date.toLocaleDateString("en-ZA", { weekday: "short" }).slice(0, 1)}
                </Text>
                <View
                  style={[
                    styles.dayNumber,
                    isSelected && styles.dayNumberSelected,
                    !isSelected && isToday && styles.dayNumberToday,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayNumberText,
                      isSelected && styles.dayNumberTextSelected,
                      !isSelected && isToday && styles.dayNumberTextToday,
                    ]}
                  >
                    {date.getDate()}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          accessibilityLabel="Next dates"
          onPress={() => setSelectedDate((date) => addDays(date, 1))}
          style={styles.arrow}
          hitSlop={8}
        >
          <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
        </Pressable>
      </View>
    </View>
  );
}

function buildDateStrip(today: Date) {
  const start = startOfWeek(today);
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

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
  },
  labelWrap: {
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  label: {
    fontSize: typography.h2,
    fontWeight: "800",
    color: colors.foreground,
  },
  subLabel: {
    fontSize: typography.tiny,
    color: colors.mutedForeground,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  arrow: {
    width: 24,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  days: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  day: {
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    minWidth: 28,
  },
  dayLetter: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.mutedForeground,
  },
  dayNumber: {
    width: 28,
    height: 28,
    borderRadius: radius.round,
    alignItems: "center",
    justifyContent: "center",
  },
  dayNumberSelected: {
    backgroundColor: colors.primary,
  },
  dayNumberToday: {
    backgroundColor: colors.accent,
  },
  dayNumberText: {
    fontSize: typography.small,
    fontWeight: "700",
    color: colors.foreground,
  },
  dayNumberTextSelected: {
    color: colors.primaryForeground,
  },
  dayNumberTextToday: {
    color: colors.primary,
  },
});
