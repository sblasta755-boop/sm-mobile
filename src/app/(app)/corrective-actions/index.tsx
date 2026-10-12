import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { StatusBadge } from "@/components/StatusBadge";
import { useSmartClean } from "@/features/store";
import { humanStatus } from "@/domain/status";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";
import type { StatusTone } from "@/theme";

export default function CorrectiveActionsScreen() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { state, currentUser } = useSmartClean();
  const mine = state.correctiveActions.filter((c) => c.assigneeId === currentUser?.id);

  return (
    <Screen title="Corrective actions">
      {mine.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.mutedSmall}>No corrective actions assigned. Well done.</Text>
        </View>
      ) : (
        mine.map((c) => {
          const tone: StatusTone = c.status === "closed" ? "success" : c.status === "overdue" ? "destructive" : "warning";
          return (
            <Pressable key={c.id} onPress={() => router.push(`/corrective-actions/${c.id}`)}>
              <Card style={styles.card}>
                <View style={styles.headerRow}>
                  <Text style={styles.reason} numberOfLines={2}>
                    {c.reason}
                  </Text>
                  <StatusBadge tone={tone} label={humanStatus(c.status)} />
                </View>
                <View style={styles.dueRow}>
                  <Ionicons name="alert-circle-outline" size={12} color={colors.mutedForeground} />
                  <Text style={styles.mutedSmall}>
                    Due {new Date(c.deadline).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
              </Card>
            </Pressable>
          );
        })
      )}
    </Screen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  empty: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: "center",
  },
  card: {
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  reason: {
    flex: 1,
    fontSize: typography.body,
    fontWeight: "700",
    color: colors.foreground,
  },
  dueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  mutedSmall: {
    fontSize: typography.small,
    color: colors.mutedForeground,
  },
}));
