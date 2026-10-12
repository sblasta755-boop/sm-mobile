import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, typography, themedStyles } from "@/theme";

export function DateStrip({
  today,
  selectedDate,
  onSelect,
}: {
  today: Date;
  selectedDate: Date;
  onSelect: (date: Date) => void;
}) {
  const weekDays = useMemo(() => buildDateStrip(selectedDate), [selectedDate]);
  const selectedLabel = selectedDate.toLocaleDateString("en-ZA", { weekday: "long" });
  const selectedSubLabel = selectedDate.toLocaleDateString("en-ZA", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <View style={styles.wrap}>
      {/* The arrows flank the date, not the seven days: in the header this strip
          sits between the back and profile buttons, where there is no room for
          seven dates and two arrows on one line. */}
      <View style={styles.labelRow}>
        <Pressable
          accessibilityLabel="Previous day"
          onPress={() => onSelect(addDays(selectedDate, -1))}
          style={styles.arrow}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={18} color={colors.mutedForeground} />
        </Pressable>
        <View style={styles.labelWrap}>
          <Text style={styles.label} numberOfLines={1}>
            {selectedLabel}
          </Text>
          <Text style={styles.subLabel}>{selectedSubLabel}</Text>
        </View>
        <Pressable
          accessibilityLabel="Next day"
          onPress={() => onSelect(addDays(selectedDate, 1))}
          style={styles.arrow}
          hitSlop={8}
        >
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <View style={styles.days}>
        {weekDays.map((date) => {
          const isSelected = isSameDay(date, selectedDate);
          const isToday = isSameDay(date, today);
          return (
            <Pressable
              key={date.toISOString()}
              onPress={() => onSelect(date)}
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

export function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const styles = themedStyles(() => StyleSheet.create({
  wrap: {
    alignSelf: "stretch",
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  labelWrap: {
    alignItems: "center",
    flexShrink: 1,
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
  arrow: {
    width: 28,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  // Seven equal cells that share whatever width there is, so nothing can overflow.
  days: {
    flexDirection: "row",
  },
  day: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
  },
  dayLetter: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.mutedForeground,
  },
  dayNumber: {
    width: 26,
    height: 26,
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
}));
