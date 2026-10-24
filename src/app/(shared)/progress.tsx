import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import {
  getMyProgress,
  type GamificationPeriod,
  type MyProgress,
} from "@/api/client";
import { ALL_BADGES, PERIOD_LABEL, rankLabel } from "@/domain/gamification";
import { useSmartClean } from "@/features/store";
import {
  colors,
  radius,
  spacing,
  typography,
  themedStyles,
  useThemeVersion,
} from "@/theme";

/** My points, position, streak and badges. Only the person's own numbers: the server never
 * sends anyone else's name or points (managers see the named leaderboard on the web). */
export default function ProgressScreen() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { state } = useSmartClean();
  const [period, setPeriod] = useState<GamificationPeriod>("week");
  const [progress, setProgress] = useState<MyProgress | null>(null);
  const [failed, setFailed] = useState(false);
  const offline = state.connectivity === "offline";

  useEffect(() => {
    if (!state.accessToken || offline) return;
    let live = true;
    setProgress(null);
    setFailed(false);
    getMyProgress(state.accessToken, period)
      .then((result) => live && setProgress(result))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [state.accessToken, period, offline]);

  return (
    <Screen title="My progress" backTo="/home">
      <View style={styles.periods}>
        {(["week", "month"] as const).map((p) => (
          <Pressable
            key={p}
            accessibilityRole="button"
            onPress={() => setPeriod(p)}
            style={[styles.period, p === period && styles.periodOn]}
          >
            <Text
              style={[styles.periodText, p === period && styles.periodTextOn]}
            >
              {PERIOD_LABEL[p]}
            </Text>
          </Pressable>
        ))}
      </View>

      {offline && (
        <Text style={styles.muted}>Your points need a connection to load.</Text>
      )}
      {!offline && failed && (
        <Text style={styles.error}>Could not load your progress.</Text>
      )}
      {!offline && !failed && !progress && (
        <ActivityIndicator color={colors.primary} />
      )}
      {progress && !progress.enabled && (
        <Card>
          <Text style={styles.muted}>
            Points and badges are not switched on for you.
          </Text>
        </Card>
      )}
      {progress?.enabled && (
        <>
          <Card style={styles.hero}>
            <Text style={styles.points}>{progress.points}</Text>
            <Text style={styles.muted}>points · {progress.siteName}</Text>
            <Text style={styles.rank}>
              {rankLabel(progress.rank, progress.of)}
            </Text>
          </Card>

          <View style={styles.statRow}>
            <Card style={styles.stat}>
              <Ionicons name="flame" size={20} color={colors.warning} />
              <Text style={styles.statValue}>{progress.streak}</Text>
              <Text style={styles.mutedSmall}>day streak</Text>
            </Card>
            <Card style={styles.stat}>
              <Ionicons name="medal-outline" size={20} color={colors.primary} />
              <Text style={styles.statValue}>{progress.longestStreak}</Text>
              <Text style={styles.mutedSmall}>longest streak</Text>
            </Card>
          </View>

          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>How you earned them</Text>
            {progress.breakdown.map((line) => (
              <View key={line.label} style={styles.line}>
                <Text style={styles.lineLabel}>
                  {line.label}
                  {line.count !== null ? ` × ${line.count}` : ""}
                </Text>
                <Text style={styles.linePoints}>+{line.points}</Text>
              </View>
            ))}
            <Text style={styles.mutedSmall}>
              Points count once a reviewer approves your work. Only you see your
              own points; your manager sees the full list.
            </Text>
          </Card>

          <Text style={styles.sectionTitle}>Badges</Text>
          {ALL_BADGES.map((badge) => {
            const earned = progress.badges.find((b) => b.key === badge.key);
            return (
              <Card
                key={badge.key}
                style={[styles.badge, !earned && styles.badgeLocked]}
              >
                <View style={[styles.badgeIcon, earned && styles.badgeIconOn]}>
                  <Ionicons
                    name={earned ? "medal" : "lock-closed-outline"}
                    size={earned ? 20 : 16}
                    color={earned ? colors.primary : colors.mutedForeground}
                  />
                </View>
                <View style={styles.badgeText}>
                  <Text style={styles.badgeTitle}>{badge.label}</Text>
                  <Text style={styles.mutedSmall}>
                    {earned
                      ? `Earned ${new Date(earned.earnedAt).toLocaleDateString("en-ZA")}`
                      : badge.description}
                  </Text>
                </View>
              </Card>
            );
          })}
        </>
      )}
    </Screen>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    periods: {
      flexDirection: "row",
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    period: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    periodOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    periodText: {
      fontSize: typography.small,
      fontWeight: "600",
      color: colors.mutedForeground,
    },
    periodTextOn: { color: colors.white },
    muted: { fontSize: typography.body, color: colors.mutedForeground },
    mutedSmall: { fontSize: typography.small, color: colors.mutedForeground },
    error: { fontSize: typography.body, color: colors.destructive },
    hero: { alignItems: "center", gap: 4, marginBottom: spacing.md },
    points: { fontSize: 44, fontWeight: "800", color: colors.foreground },
    rank: {
      fontSize: typography.body,
      fontWeight: "700",
      color: colors.foreground,
      marginTop: spacing.xs,
    },
    statRow: {
      flexDirection: "row",
      gap: spacing.md,
      marginBottom: spacing.md,
    },
    stat: { flex: 1, alignItems: "center", gap: 2 },
    statValue: { fontSize: 24, fontWeight: "800", color: colors.foreground },
    section: { marginBottom: spacing.md, gap: spacing.sm },
    sectionTitle: {
      fontSize: typography.body,
      fontWeight: "700",
      color: colors.foreground,
      marginBottom: spacing.xs,
    },
    line: { flexDirection: "row", justifyContent: "space-between" },
    lineLabel: { fontSize: typography.body, color: colors.foreground },
    linePoints: {
      fontSize: typography.body,
      fontWeight: "700",
      color: colors.foreground,
    },
    badge: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      marginBottom: spacing.sm,
    },
    badgeLocked: { opacity: 0.6 },
    badgeIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.muted,
    },
    badgeIconOn: { backgroundColor: colors.infoSoft },
    badgeText: { flex: 1, minWidth: 0 },
    badgeTitle: {
      fontSize: typography.body,
      fontWeight: "700",
      color: colors.foreground,
    },
  }),
);
