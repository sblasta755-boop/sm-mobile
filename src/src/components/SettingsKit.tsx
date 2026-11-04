import { useState, type ReactNode } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View, type ViewProps } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { hexAlpha, mixHex } from "@/domain/calendarGrid";
import { colors, radius, shadows, sizes, spacing, themedStyles, typography, useThemeVersion } from "@/theme";

/**
 * The building blocks of every role's Profile screen (design option E, docs/design/settings-screen-options):
 * a hero card with the person and their shift, small stat tiles, and collapsible sections of uniform rows.
 * One kit so the five role profiles look the same and a new row cannot come out styled differently.
 */

type Glyph = keyof typeof Ionicons.glyphMap;

// ---- Row ----

/**
 * One row: an icon tile, a title with an optional hint, and something on the right (a switch, a small
 * selector, a value, or a chevron when the row opens something). Every row draws a hairline above itself,
 * so the line under a section's header is the first row's and a row that renders nothing leaves no stray line.
 */
export function SettingsRow({
  icon,
  title,
  sub,
  right,
  onPress,
  tone,
  ...rest
}: {
  icon: Glyph | ReactNode;
  title: string;
  sub?: string;
  right?: ReactNode;
  onPress?: () => void;
  /** "destructive" colours the title red. */
  tone?: "destructive";
} & ViewProps) {
  useThemeVersion();
  const body = (
    <>
      <View style={styles.tile}>
        {typeof icon === "string" ? (
          <Ionicons name={icon as Glyph} size={17} color={colors.primary} />
        ) : (
          icon
        )}
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, tone === "destructive" && { color: colors.destructive }]} numberOfLines={1}>
          {title}
        </Text>
        {sub ? (
          <Text style={styles.rowSub} numberOfLines={2}>
            {sub}
          </Text>
        ) : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} /> : null)}
    </>
  );
  if (!onPress) {
    return (
      <View style={styles.row} {...rest}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={sub ? `${title}, ${sub}` : title}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      {...rest}
    >
      {body}
    </Pressable>
  );
}

/** A small selector for a row's right side: icons or short words. */
export function RowSegment<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label?: string; icon?: Glyph }[];
  onChange: (value: T) => void;
  label: string;
}) {
  useThemeVersion();
  return (
    <View style={styles.segment} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={o.label ?? o.value}
            onPress={() => onChange(o.value)}
            hitSlop={4}
            style={[styles.segOption, selected && styles.segOptionOn]}
          >
            {o.icon ? (
              <Ionicons name={o.icon} size={15} color={selected ? colors.primaryForeground : colors.mutedForeground} />
            ) : (
              <Text style={[styles.segText, selected && styles.segTextOn]}>{o.label}</Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

// ---- Section ----

/** A card with a tappable header that opens and closes its rows. */
export function SettingsSection({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  /** How many rows it holds, shown as a small pill. Leave out when it can vary. */
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  useThemeVersion();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.section}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}, ${open ? "open" : "closed"}`}
        onPress={() => setOpen((o) => !o)}
        style={styles.sectionHeader}
      >
        <Text style={styles.sectionTitle}>{title}</Text>
        {count ? (
          <View style={styles.countPill}>
            <Text style={styles.countText}>{count}</Text>
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
        <Ionicons name={open ? "chevron-down" : "chevron-forward"} size={18} color={colors.mutedForeground} />
      </Pressable>
      {open ? children : null}
    </View>
  );
}

// ---- Hero ----

export type HeroAction = { label: string; icon?: Glyph; onPress: () => void };

/** The person, with their shift when they have one. Dark card in the theme's shift colours. */
export function ProfileHero({
  name,
  subtitle,
  detail,
  initials,
  photoUrl,
  onPhotoPress,
  uploading,
  status,
  shift,
}: {
  name: string;
  subtitle: string;
  /** A second muted line, such as an email address. */
  detail?: string;
  initials: string;
  photoUrl?: string | null;
  onPhotoPress?: () => void;
  uploading?: boolean;
  /** The pill at the top right, such as "On shift". */
  status?: { label: string; on: boolean };
  /** Shown only for people who work shifts. */
  shift?: { clockIn: string; onSite: string; action: HeroAction };
}) {
  useThemeVersion();
  const text = colors.shiftForeground;
  const avatar = (
    <View style={styles.avatar}>
      {photoUrl ? <Image source={{ uri: photoUrl }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{initials}</Text>}
      {onPhotoPress ? (
        <View style={styles.avatarBadge}>
          <Ionicons name="camera" size={11} color={colors.foreground} />
        </View>
      ) : null}
      {uploading ? (
        <View style={styles.avatarUploading}>
          <ActivityIndicator color={colors.white} />
        </View>
      ) : null}
    </View>
  );
  return (
    <View style={styles.heroWrap}>
      <LinearGradient
        colors={[colors.shiftBackground, mixHex(colors.shiftBackground, colors.primary, 0.45)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.heroTop}>
        {onPhotoPress ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Change profile photo" disabled={uploading} onPress={onPhotoPress}>
            {avatar}
          </Pressable>
        ) : (
          avatar
        )}
        <View style={styles.heroInfo}>
          <Text style={[styles.heroName, { color: text }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[styles.heroSub, { color: hexAlpha(text, 0.8) }]} numberOfLines={1}>
            {subtitle}
          </Text>
          {detail ? (
            <Text style={[styles.heroSub, { color: hexAlpha(text, 0.65) }]} numberOfLines={1}>
              {detail}
            </Text>
          ) : null}
        </View>
        {status ? (
          <View style={[styles.statusPill, { backgroundColor: hexAlpha(text, 0.16) }]}>
            <View style={[styles.statusDot, { backgroundColor: status.on ? "#4ade80" : hexAlpha(text, 0.5) }]} />
            <Text style={[styles.statusText, { color: text }]}>{status.label}</Text>
          </View>
        ) : null}
      </View>
      {shift ? (
        <View style={styles.shiftRow}>
          <View>
            <Text style={[styles.shiftLabel, { color: hexAlpha(text, 0.65) }]}>CLOCK-IN</Text>
            <Text style={[styles.shiftValue, { color: text }]}>{shift.clockIn}</Text>
          </View>
          <View>
            <Text style={[styles.shiftLabel, { color: hexAlpha(text, 0.65) }]}>ON SITE</Text>
            <Text style={[styles.shiftValue, { color: text }]}>{shift.onSite}</Text>
          </View>
          <View style={{ flex: 1 }} />
          <Pressable
            accessibilityRole="button"
            onPress={shift.action.onPress}
            style={({ pressed }) => [styles.heroButton, { backgroundColor: text }, pressed && styles.pressed]}
          >
            <Ionicons name={shift.action.icon ?? "time-outline"} size={15} color={colors.shiftBackground} />
            <Text style={[styles.heroButtonText, { color: colors.shiftBackground }]}>{shift.action.label}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

// ---- Stat tiles ----

/** A small card with one number, and a progress bar when it is a share of something. */
export function StatTile({ label, value, progress }: { label: string; value: string; progress?: number }) {
  useThemeVersion();
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {progress !== undefined ? (
        <View style={styles.bar}>
          <View style={[styles.barFill, { width: `${Math.max(0, Math.min(1, progress)) * 100}%` }]} />
        </View>
      ) : null}
    </View>
  );
}

export function StatRow({ children }: { children: ReactNode }) {
  return <View style={styles.statRow}>{children}</View>;
}

// ---- Sign out ----

export function SignOutButton({ onPress }: { onPress: () => void }) {
  useThemeVersion();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}
    >
      <Ionicons name="log-out-outline" size={17} color={colors.destructive} />
      <Text style={styles.signOutText}>Sign out</Text>
    </Pressable>
  );
}

/** "4h 07m" since an ISO time, for the shift card. */
export function sinceLabel(iso: string | undefined, now = Date.now()): string {
  if (!iso) return "-";
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  const h = Math.floor(minutes / 60);
  const m = String(minutes % 60).padStart(2, "0");
  return h > 0 ? `${h}h ${m}m` : `${minutes}m`;
}

const styles = themedStyles(() =>
  StyleSheet.create({
    pressed: { opacity: 0.7 },
    // row
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      minHeight: sizes.touchTarget + spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    tile: {
      width: 34,
      height: 34,
      borderRadius: radius.lg + 1,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    rowText: { flex: 1, minWidth: 0 },
    rowTitle: { fontSize: typography.body, fontWeight: "600", color: colors.foreground },
    rowSub: { fontSize: typography.small, color: colors.mutedForeground, marginTop: 1 },
    // segment
    segment: {
      flexDirection: "row",
      gap: 3,
      padding: 3,
      borderRadius: radius.lg,
      backgroundColor: colors.secondary,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    segOption: {
      minWidth: 34,
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      borderRadius: radius.md,
      alignItems: "center",
      justifyContent: "center",
    },
    segOptionOn: { backgroundColor: colors.primary },
    segText: { fontSize: typography.small, fontWeight: "600", color: colors.mutedForeground },
    segTextOn: { color: colors.primaryForeground },
    // section
    section: {
      backgroundColor: colors.card,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
      marginBottom: spacing.md,
      ...shadows.card,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      minHeight: sizes.touchTarget + spacing.sm,
    },
    sectionTitle: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    countPill: {
      minWidth: 22,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: radius.round,
      backgroundColor: colors.accent,
      alignItems: "center",
    },
    countText: { fontSize: typography.tiny, fontWeight: "700", color: colors.primary },
    // hero
    heroWrap: {
      borderRadius: radius.xl + 6,
      padding: spacing.lg,
      gap: spacing.lg,
      overflow: "hidden",
      marginBottom: spacing.md,
    },
    heroTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    heroInfo: { flex: 1, minWidth: 0, gap: 1 },
    heroName: { fontSize: typography.h2, fontWeight: "800" },
    heroSub: { fontSize: typography.small },
    avatar: {
      width: 54,
      height: 54,
      borderRadius: 27,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarImage: { width: 54, height: 54, borderRadius: 27 },
    avatarText: { color: colors.primaryForeground, fontWeight: "800", fontSize: typography.h2 },
    avatarBadge: {
      position: "absolute",
      right: -3,
      bottom: -3,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarUploading: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 27,
      backgroundColor: colors.overlay,
      alignItems: "center",
      justifyContent: "center",
    },
    statusPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: radius.round,
    },
    statusDot: { width: 7, height: 7, borderRadius: 4 },
    statusText: { fontSize: typography.small, fontWeight: "700" },
    shiftRow: { flexDirection: "row", alignItems: "center", gap: spacing.xl },
    shiftLabel: { fontSize: 10, letterSpacing: 1.2, fontWeight: "700" },
    shiftValue: { fontSize: typography.h1, fontWeight: "800", marginTop: 2 },
    heroButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      height: 40,
      paddingHorizontal: spacing.md,
      borderRadius: radius.xl,
    },
    heroButtonText: { fontSize: typography.small, fontWeight: "700" },
    // stats
    statRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
    stat: {
      flex: 1,
      padding: spacing.md,
      gap: 2,
      backgroundColor: colors.card,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadows.card,
    },
    statLabel: { fontSize: typography.tiny, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", color: colors.mutedForeground },
    statValue: { fontSize: typography.h1, fontWeight: "800", color: colors.foreground },
    bar: { height: 6, borderRadius: 3, backgroundColor: colors.border, marginTop: spacing.xs, overflow: "hidden" },
    barFill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
    // sign out
    signOut: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      minHeight: sizes.touchTarget + 6,
      borderRadius: radius.xl,
      borderWidth: 1.5,
      borderColor: hexAlpha(colors.destructive, 0.45),
      marginTop: spacing.xs,
    },
    signOutText: { fontSize: typography.body, fontWeight: "700", color: colors.destructive },
  }),
);
