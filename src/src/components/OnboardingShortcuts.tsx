import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useSmartClean } from "@/features/store";
import { colors, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

/**
 * "Add a team member" and "Approvals" for someone who has been given the right to onboard staff (supervisors and field
 * staff; managers have it in their own tabs). Renders nothing for anyone else. The permission is a setting on the
 * person (canOnboardStaff), which the server also enforces.
 */
export function OnboardingShortcuts() {
  useThemeVersion();
  const { currentUser } = useSmartClean();
  if (!currentUser?.canOnboardStaff) return null;
  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Ionicons name="person-add" size={18} color={colors.primary} />
        <Text style={styles.title}>Onboarding</Text>
      </View>
      <Text style={styles.body}>You can bring new staff on to your site.</Text>
      <View style={styles.row}>
        <Button onPress={() => router.push("/add-staff" as never)}>Add staff</Button>
        <Button variant="outline" onPress={() => router.push("/onboarding-approvals" as never)}>
          Approvals
        </Button>
      </View>
    </Card>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    card: { gap: spacing.sm },
    head: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
    title: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    body: { fontSize: typography.small, color: colors.mutedForeground },
    row: { gap: spacing.xs },
  }),
);
