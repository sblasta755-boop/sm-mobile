import { StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { homePathForRole } from "@/features/roles";
import { useSmartClean } from "@/features/store";
import { colors, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

/** The order is saved. Shows its reference so the person can read it back if asked. */
export default function VerificationDoneScreen() {
  useThemeVersion();
  const { reference, workflow } = useLocalSearchParams<{ reference?: string; workflow?: string }>();
  const { currentUser } = useSmartClean();
  return (
    <Screen title="Saved">
      <Card>
        <View style={styles.center}>
          <Ionicons name="checkmark-circle" size={56} color={colors.primary} />
          <Text style={styles.title}>Order verified</Text>
          {workflow ? <Text style={styles.muted}>{workflow}</Text> : null}
          {reference ? (
            <>
              <Text style={styles.muted}>Order number</Text>
              <Text style={styles.reference} selectable>
                {reference}
              </Text>
            </>
          ) : null}
        </View>
      </Card>
      <View style={styles.actions}>
        <Button onPress={() => router.replace("/verification" as never)}>Verify another order</Button>
        <Button
          variant="outline"
          onPress={() => router.replace(homePathForRole(currentUser?.role) as never)}
        >
          Done
        </Button>
      </View>
    </Screen>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    center: { alignItems: "center", gap: spacing.xs, paddingVertical: spacing.md },
    title: { fontSize: typography.title, fontWeight: "800", color: colors.foreground },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    reference: { fontSize: typography.title, fontWeight: "800", color: colors.foreground },
    actions: { gap: spacing.sm, marginTop: spacing.md },
  }),
);
