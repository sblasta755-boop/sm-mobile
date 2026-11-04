import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, themedStyles, typography, useThemeVersion } from "@/theme";
import type { TeamSummary } from "@/domain/teamGroups";
import { teamStatusLine } from "@/domain/teamGroups";

/**
 * The Team screen's pieces, in the Overview's style: the head-count card with its split bar, the By site / By role
 * switch, a group card that opens to its people, and a person row. Theme tokens only, so light, dark and an
 * organisation's brand colour all apply.
 */

type Glyph = keyof typeof Ionicons.glyphMap;

/** "7 people · all active" with a bar split into managers, supervisors and field staff (auditors only when there are some). */
export function TeamCard({ summary }: { summary: TeamSummary }) {
  useThemeVersion();
  const parts = [
    { label: "Managers", value: summary.managers, color: colors.primary },
    { label: "Supervisors", value: summary.supervisors, color: colors.info },
    { label: "Field staff", value: summary.field, color: colors.success },
    ...(summary.auditors ? [{ label: "Auditors", value: summary.auditors, color: colors.neutral }] : []),
  ];
  const total = summary.total || 1;
  return (
    <View style={styles.card}>
      <View style={styles.label}>
        <Ionicons name="people-outline" size={16} color={colors.mutedForeground} />
        <Text style={styles.labelText}>Your team</Text>
      </View>
      <Text style={styles.bigNumber}>
        {summary.total}
        <Text style={styles.unit}>
          {"  "}
          {summary.total === 1 ? "person" : "people"} · {teamStatusLine(summary)}
        </Text>
      </Text>
      {summary.total > 0 && (
        <>
          <View style={styles.split}>
            {parts
              .filter((p) => p.value > 0)
              .map((p) => (
                <View key={p.label} style={{ flex: p.value / total, backgroundColor: p.color, borderRadius: 4 }} />
              ))}
          </View>
          <View style={styles.legend}>
            {parts.map((p) => (
              <View key={p.label} style={styles.legendItem}>
                <View style={[styles.dot, { backgroundColor: p.color }]} />
                <Text style={styles.legendText}>
                  {p.label} {p.value}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

/** Two equal segments with both names showing. */
export function ViewSwitch<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  useThemeVersion();
  return (
    <View style={styles.switch} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, on && styles.segmentOn]}
          >
            <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Up to four initials, overlapping, then "+n". */
function Faces({ initials }: { initials: string[] }) {
  const shown = initials.slice(0, 4);
  const more = initials.length - shown.length;
  return (
    <View style={styles.faces}>
      {shown.map((t, i) => (
        <View key={i} style={[styles.face, i > 0 && styles.faceOverlap]}>
          <Text style={styles.faceText}>{t}</Text>
        </View>
      ))}
      {more > 0 && <Text style={styles.more}>+{more}</Text>}
    </View>
  );
}

/** A card with an icon, title, subtitle and faces; tapping the header opens it to its people. */
export function GroupCard({
  icon,
  title,
  subtitle,
  initials,
  open,
  onToggle,
  children,
}: {
  icon: Glyph;
  title: string;
  subtitle: string;
  initials: string[];
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  useThemeVersion();
  return (
    <View style={[styles.card, styles.groupCard]}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}, ${subtitle}`}
        style={styles.groupHead}
      >
        <View style={styles.groupIcon}>
          <Ionicons name={icon} size={18} color={colors.primary} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.groupTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <Faces initials={initials} />
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
      </Pressable>
      {open && <View style={styles.groupBody}>{children}</View>}
    </View>
  );
}

/** A small uppercase heading inside an open group ("Runs it", "On the floor"). */
export function GroupSection({ title }: { title: string }) {
  return <Text style={styles.section}>{title}</Text>;
}

/** A person in a group: avatar, name, a second line, a tag only when they are not simply active. */
export function PersonRow({
  initials,
  name,
  detail,
  status,
  first,
  onPress,
}: {
  initials: string;
  name: string;
  detail: string;
  status: string;
  first: boolean;
  onPress: () => void;
}) {
  useThemeVersion();
  const pending = status === "Pending Activation";
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={[styles.row, !first && styles.rowDivider]}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>
      <View style={styles.flex}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {detail}
        </Text>
      </View>
      {status !== "Active" && (
        <View style={[styles.tag, pending ? styles.tagWarn : styles.tagMuted]}>
          <Text style={[styles.tagText, { color: pending ? colors.warningForeground : colors.mutedForeground }]}>
            {pending ? "Waiting to sign in" : status}
          </Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    flex: { flex: 1, minWidth: 0 },
    card: {
      backgroundColor: colors.card,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      marginBottom: spacing.sm + 2,
    },
    label: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    labelText: { fontSize: typography.small + 1, color: colors.mutedForeground },
    bigNumber: { marginTop: spacing.xs, fontSize: 36, fontWeight: "300", color: colors.foreground, letterSpacing: -0.5 },
    unit: { fontSize: typography.body, fontWeight: "400", color: colors.mutedForeground, letterSpacing: 0 },
    split: { flexDirection: "row", gap: 3, height: 10, marginTop: spacing.md },
    legend: { flexDirection: "row", flexWrap: "wrap", columnGap: spacing.lg, rowGap: 6, marginTop: spacing.md },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
    legendText: { fontSize: typography.small, color: colors.mutedForeground },
    dot: { width: 8, height: 8, borderRadius: 4 },
    switch: {
      flexDirection: "row",
      gap: 4,
      padding: 4,
      borderRadius: radius.round,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.md,
    },
    segment: { flex: 1, height: 36, borderRadius: radius.round, alignItems: "center", justifyContent: "center" },
    segmentOn: { backgroundColor: colors.accent },
    segmentText: { fontSize: typography.small + 1, color: colors.mutedForeground },
    segmentTextOn: { color: colors.primary, fontWeight: "600" },
    groupCard: { padding: 0, overflow: "hidden" },
    groupHead: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg },
    groupIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    groupTitle: { fontSize: typography.body + 1, fontWeight: "600", color: colors.foreground },
    groupBody: { borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: spacing.lg, paddingBottom: 2 },
    faces: { flexDirection: "row", alignItems: "center" },
    face: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.primary,
      borderWidth: 2,
      borderColor: colors.card,
      alignItems: "center",
      justifyContent: "center",
    },
    faceOverlap: { marginLeft: -8 },
    faceText: { fontSize: 9, fontWeight: "700", color: colors.primaryForeground },
    more: { marginLeft: 4, fontSize: typography.small, color: colors.mutedForeground },
    section: {
      paddingTop: spacing.md,
      fontSize: typography.tiny + 1,
      fontWeight: "700",
      letterSpacing: 0.8,
      textTransform: "uppercase",
      color: colors.mutedForeground,
    },
    row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 11 },
    rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
    avatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: { fontSize: typography.small, fontWeight: "800", color: colors.primaryForeground },
    name: { fontSize: typography.body, fontWeight: "600", color: colors.foreground },
    sub: { fontSize: typography.small, color: colors.mutedForeground },
    tag: { borderRadius: radius.round, paddingHorizontal: 8, paddingVertical: 3 },
    tagWarn: { backgroundColor: colors.warningSoft },
    tagMuted: { backgroundColor: colors.secondary },
    tagText: { fontSize: typography.tiny + 1, fontWeight: "600" },
  }),
);
