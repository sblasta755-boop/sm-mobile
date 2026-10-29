import { useCallback, useState, type ReactNode } from "react";
import {
  LayoutAnimation,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import { Ionicons } from "@expo/vector-icons";
import {
  dayKey,
  heatColor,
  mixHex,
  monthDays,
  monthTitle,
  parseDayKey,
  weekdayInitials,
} from "@/domain/calendarGrid";
import {
  colors,
  radius,
  spacing,
  typography,
  themedStyles,
  useThemeVersion,
} from "@/theme";

// The app's calendar look: a collapsible card with an uppercase month title,
// rounded day tiles tinted by how busy the day is, small count pills, a dotted
// month strip that stands in for the grid when collapsed, and a legend. Colours
// come from the theme palette, so an organisation's theme restyles every
// calendar at once. Mirrors the web app's components/smartclean/CoolCalendar.tsx.

export type DayTileData = {
  /** 0..1: how busy the day is. Drives the heat tint. */
  intensity?: number;
  /** A small pill on the tile, e.g. a head-count. */
  badge?: string | number;
  /** A fixed tint instead of heat, or "muted" for past or inactive days. */
  tone?: "good" | "bad" | "info" | "muted";
  label?: string;
  disabled?: boolean;
};

const toneTint = (tone: NonNullable<DayTileData["tone"]>): string => {
  switch (tone) {
    case "good":
      return mixHex(colors.card, colors.success, 0.3);
    case "bad":
      return mixHex(colors.card, colors.destructive, 0.26);
    case "info":
      return mixHex(colors.card, colors.info, 0.26);
    default:
      return colors.muted;
  }
};

/** Remembers, per calendar, whether it was collapsed. Reads synchronously so there is no flash. */
export function useCollapsed(
  id: string,
  initial = false,
  persist = true,
): [boolean, () => void] {
  const key = `soma.calendar.${id}`;
  const [collapsed, setCollapsed] = useState(() => {
    if (!persist) return initial;
    try {
      const saved = SecureStore.getItem(key);
      return saved === null ? initial : saved === "1";
    } catch {
      return initial;
    }
  });
  const toggle = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsed((current) => {
      const next = !current;
      if (persist)
        SecureStore.setItemAsync(key, next ? "1" : "0").catch(() => {});
      return next;
    });
  }, [key, persist]);
  return [collapsed, toggle];
}

export function CalendarFrame({
  id,
  title,
  caption,
  onPrev,
  onNext,
  onToday,
  collapsedSummary,
  defaultCollapsed = false,
  persist = true,
  children,
}: {
  /** Stable key for remembering the collapsed state. */
  id: string;
  title: string;
  caption?: string;
  onPrev?: () => void;
  onNext?: () => void;
  onToday?: () => void;
  /** What stays visible when collapsed: usually a <DotStrip/>. */
  collapsedSummary?: ReactNode;
  defaultCollapsed?: boolean;
  persist?: boolean;
  children: ReactNode;
}) {
  useThemeVersion();
  const [collapsed, toggle] = useCollapsed(id, defaultCollapsed, persist);
  return (
    <View style={styles.frame}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: !collapsed }}
          accessibilityLabel={`${title}, ${collapsed ? "expand" : "collapse"} calendar`}
          onPress={toggle}
          style={styles.titleButton}
          hitSlop={6}
        >
          <View style={styles.chevron}>
            <Ionicons
              name={collapsed ? "chevron-forward" : "chevron-down"}
              size={16}
              color={colors.mutedForeground}
            />
          </View>
          <View style={styles.flex}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {caption ? (
              <Text style={styles.caption} numberOfLines={1}>
                {caption}
              </Text>
            ) : null}
          </View>
        </Pressable>
        <View style={styles.actions}>
          {onPrev && (
            <Pressable
              accessibilityLabel="Previous"
              onPress={onPrev}
              style={styles.roundButton}
              hitSlop={6}
            >
              <Ionicons
                name="chevron-back"
                size={16}
                color={colors.foreground}
              />
            </Pressable>
          )}
          {onToday && (
            <Pressable
              accessibilityRole="button"
              onPress={onToday}
              style={styles.todayButton}
              hitSlop={6}
            >
              <Text style={styles.todayText}>Today</Text>
            </Pressable>
          )}
          {onNext && (
            <Pressable
              accessibilityLabel="Next"
              onPress={onNext}
              style={styles.roundButton}
              hitSlop={6}
            >
              <Ionicons
                name="chevron-forward"
                size={16}
                color={colors.foreground}
              />
            </Pressable>
          )}
        </View>
      </View>
      {collapsed ? (
        collapsedSummary ? (
          <View style={styles.summary}>{collapsedSummary}</View>
        ) : null
      ) : (
        <View style={styles.body}>{children}</View>
      )}
    </View>
  );
}

function DayCell({
  day,
  t,
  today,
  isSelected,
  outside,
  onSelect,
}: {
  day: string;
  t: DayTileData;
  today: string;
  isSelected: boolean;
  outside: boolean;
  onSelect?: (day: string) => void;
}) {
  const date = parseDayKey(day);
  const isToday = day === today;
  const heat = !t.tone && (t.intensity ?? 0) > 0;
  const background = isSelected
    ? colors.primary
    : t.tone
      ? toneTint(t.tone)
      : heat
        ? heatColor(colors.card, colors.primary, t.intensity ?? 0)
        : colors.muted;
  const strong = !isSelected && heat && (t.intensity ?? 0) > 0.7;
  const textColor =
    isSelected || strong
      ? colors.primaryForeground
      : t.tone === "muted"
        ? colors.mutedForeground
        : colors.foreground;
  return (
    <View style={styles.cellWrap}>
      <Pressable
        accessibilityRole={onSelect ? "button" : undefined}
        accessibilityLabel={
          t.label ??
          date.toLocaleDateString("en-ZA", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })
        }
        accessibilityState={{ selected: isSelected, disabled: t.disabled }}
        disabled={!onSelect || t.disabled}
        onPress={() => onSelect?.(day)}
        style={({ pressed }) => [
          styles.cell,
          { backgroundColor: background },
          outside && styles.outside,
          isToday &&
            !isSelected && { borderWidth: 2, borderColor: colors.primary },
          t.disabled && styles.disabled,
          pressed && styles.pressed,
        ]}
      >
        <Text style={[styles.dayNumber, { color: textColor }]}>
          {date.getDate()}
        </Text>
        {t.badge !== undefined && t.badge !== "" && (
          <View
            style={[
              styles.badge,
              {
                backgroundColor: isSelected
                  ? colors.primaryForeground
                  : colors.foreground,
              },
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                { color: isSelected ? colors.primary : colors.background },
              ]}
            >
              {t.badge}
            </Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

const selectedSetOf = (selected?: string | string[]) =>
  new Set(Array.isArray(selected) ? selected : selected ? [selected] : []);

export function MonthTiles({
  month,
  weekStartsOn = 1,
  tile,
  today = dayKey(new Date()),
  selected,
  onSelect,
}: {
  month: Date;
  weekStartsOn?: 0 | 1;
  tile: (day: string) => DayTileData;
  today?: string;
  selected?: string | string[];
  onSelect?: (day: string) => void;
}) {
  useThemeVersion();
  const days = monthDays(month, weekStartsOn);
  const selectedSet = selectedSetOf(selected);
  return (
    <View>
      <View style={styles.row}>
        {weekdayInitials(weekStartsOn).map((label) => (
          <Text key={label} style={styles.weekday}>
            {label}
          </Text>
        ))}
      </View>
      <View style={styles.row}>
        {days.map((day) => (
          <DayCell
            key={day}
            day={day}
            t={tile(day)}
            today={today}
            isSelected={selectedSet.has(day)}
            outside={parseDayKey(day).getMonth() !== month.getMonth()}
            onSelect={onSelect}
          />
        ))}
      </View>
    </View>
  );
}

/** Seven tiles in a row (a week), headed by the weekday names - the compact view. */
export function WeekTiles({
  days,
  tile,
  today = dayKey(new Date()),
  selected,
  onSelect,
}: {
  days: string[];
  tile: (day: string) => DayTileData;
  today?: string;
  selected?: string | string[];
  onSelect?: (day: string) => void;
}) {
  useThemeVersion();
  const selectedSet = selectedSetOf(selected);
  return (
    <View>
      <View style={styles.row}>
        {days.map((day) => (
          <Text key={day} style={styles.weekday}>
            {parseDayKey(day)
              .toLocaleDateString("en-ZA", { weekday: "short" })
              .slice(0, 3)
              .toUpperCase()}
          </Text>
        ))}
      </View>
      <View style={styles.row}>
        {days.map((day) => (
          <DayCell
            key={day}
            day={day}
            t={tile(day)}
            today={today}
            isSelected={selectedSet.has(day)}
            outside={false}
            onSelect={onSelect}
          />
        ))}
      </View>
    </View>
  );
}

/** One dot per day of the month, tinted like the tiles - the collapsed view. */
export function DotStrip({
  month,
  tile,
  today = dayKey(new Date()),
  left,
  right,
}: {
  month: Date;
  tile: (day: string) => DayTileData;
  today?: string;
  left?: string;
  right?: string;
}) {
  useThemeVersion();
  const count = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();
  const days = Array.from({ length: count }, (_, i) =>
    dayKey(new Date(month.getFullYear(), month.getMonth(), i + 1)),
  );
  return (
    <View accessibilityLabel="Month overview">
      <View style={styles.stripHead}>
        <Text style={styles.stripText} numberOfLines={1}>
          {left ??
            `TODAY · ${parseDayKey(today).toLocaleDateString("en-ZA", { month: "short", day: "numeric" }).toUpperCase()}`}
        </Text>
        {right ? (
          <Text style={styles.stripText} numberOfLines={1}>
            {right.toUpperCase()}
          </Text>
        ) : null}
      </View>
      <View style={styles.dots}>
        {days.map((day) => {
          const t = tile(day);
          const background = t.tone
            ? toneTint(t.tone)
            : (t.intensity ?? 0) > 0
              ? heatColor(colors.card, colors.primary, t.intensity ?? 0)
              : colors.muted;
          return (
            <View
              key={day}
              style={[
                styles.dot,
                { backgroundColor: background },
                day === today && styles.dotToday,
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

export function CalendarLegend({
  items,
}: {
  items: { label: string; color?: string; ring?: boolean }[];
}) {
  useThemeVersion();
  return (
    <View style={styles.legend}>
      {items.map((item) => (
        <View key={item.label} style={styles.legendItem}>
          <View
            style={[
              styles.legendDot,
              { backgroundColor: item.color ?? colors.muted },
              item.ring && {
                borderWidth: 2,
                borderColor: colors.primary,
                backgroundColor: colors.card,
              },
            ]}
          />
          <Text style={styles.legendText}>{item.label.toUpperCase()}</Text>
        </View>
      ))}
    </View>
  );
}

/** Standard month heading. */
export { monthTitle };

const styles = themedStyles(() =>
  StyleSheet.create({
    flex: { flex: 1, minWidth: 0 },
    frame: {
      backgroundColor: colors.card,
      borderRadius: radius.xl * 1.5,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    header: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    titleButton: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    chevron: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.muted,
    },
    title: {
      fontSize: typography.small,
      fontWeight: "800",
      letterSpacing: 1.6,
      textTransform: "uppercase",
      color: colors.foreground,
    },
    caption: { fontSize: typography.tiny, color: colors.mutedForeground },
    actions: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
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
      paddingHorizontal: spacing.sm,
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
    summary: { marginTop: spacing.md },
    body: { marginTop: spacing.md },
    row: { flexDirection: "row", flexWrap: "wrap" },
    weekday: {
      width: "14.2857%",
      textAlign: "center",
      fontSize: 9,
      fontWeight: "700",
      letterSpacing: 1.4,
      color: colors.mutedForeground,
      paddingBottom: spacing.xs,
    },
    cellWrap: { width: "14.2857%", padding: 2 },
    cell: {
      aspectRatio: 1,
      borderRadius: radius.xl,
      alignItems: "center",
      justifyContent: "center",
    },
    outside: { opacity: 0.4 },
    disabled: { opacity: 0.3 },
    pressed: { transform: [{ scale: 0.95 }] },
    dayNumber: { fontSize: typography.small, fontWeight: "700", marginTop: -5 },
    badge: {
      position: "absolute",
      bottom: 3,
      minWidth: 16,
      paddingHorizontal: 4,
      borderRadius: 6,
      alignItems: "center",
    },
    badgeText: { fontSize: 9, fontWeight: "800" },
    stripHead: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: spacing.sm,
      marginBottom: 6,
    },
    stripText: {
      fontSize: 9,
      fontWeight: "700",
      letterSpacing: 1.3,
      color: colors.mutedForeground,
      flexShrink: 1,
    },
    dots: { flexDirection: "row", gap: 3 },
    dot: { flex: 1, height: 10, borderRadius: 5, minWidth: 3 },
    dotToday: { borderWidth: 2, borderColor: colors.foreground },
    legend: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.md,
      marginTop: spacing.md,
    },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
    legendDot: { width: 10, height: 10, borderRadius: 5 },
    legendText: {
      fontSize: 9,
      fontWeight: "700",
      letterSpacing: 1.2,
      color: colors.mutedForeground,
    },
  }),
);
