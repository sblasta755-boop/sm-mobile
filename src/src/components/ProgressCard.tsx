import { useEffect, useState } from "react";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/Card";
import { getMyProgress, type MyProgress } from "@/api/client";
import { rankLabel } from "@/domain/gamification";
import { useModules } from "@/features/modules";
import { useSmartClean } from "@/features/store";
import {
  colors,
  radius,
  spacing,
  typography,
  themedStyles,
  useThemeVersion,
} from "@/theme";

/** A person's own points, position, streak and badges this week. Renders nothing unless the
 * organisation has switched gamification on for their site and they take part. */
export function ProgressCard() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { state } = useSmartClean();
  const enabledForOrg = useModules().has("gamification");
  const [progress, setProgress] = useState<MyProgress | null>(null);

  useEffect(() => {
    if (
      !enabledForOrg ||
      !state.accessToken ||
      state.connectivity === "offline"
    )
      return;
    let live = true;
    getMyProgress(state.accessToken, "week")
      .then((result) => live && setProgress(result))
      .catch(() => live && setProgress(null));
    return () => {
      live = false;
    };
  }, [enabledForOrg, state.accessToken, state.connectivity]);

  if (!progress || !progress.enabled) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open my progress"
      onPress={() => router.push("/progress" as never)}
    >
      <Card style={styles.card}>
        <View style={styles.icon}>
          <Ionicons name="trophy-outline" size={20} color={colors.primary} />
        </View>
        <View style={styles.text}>
          <Text style={styles.title}>{progress.points} points this week</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {rankLabel(progress.rank, progress.of)}
          </Text>
        </View>
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Ionicons name="flame" size={16} color={colors.warning} />
            <Text style={styles.statText}>{progress.streak}</Text>
          </View>
          <View style={styles.stat}>
            <Ionicons name="medal-outline" size={16} color={colors.primary} />
            <Text style={styles.statText}>{progress.badges.length}</Text>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      marginBottom: spacing.md,
    },
    icon: {
      width: 40,
      height: 40,
      borderRadius: radius.lg,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.infoSoft,
    },
    text: { flex: 1, minWidth: 0 },
    title: {
      fontSize: typography.body,
      fontWeight: "700",
      color: colors.foreground,
    },
    sub: { fontSize: typography.small, color: colors.mutedForeground },
    stats: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    stat: { flexDirection: "row", alignItems: "center", gap: 4 },
    statText: {
      fontSize: typography.small,
      fontWeight: "600",
      color: colors.foreground,
    },
  }),
);
