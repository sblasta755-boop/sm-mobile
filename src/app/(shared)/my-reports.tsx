import { Redirect, router } from "expo-router";
import { StyleSheet, Text } from "react-native";
import { Screen } from "@/components/Screen";
import { SettingsRow, SettingsSection } from "@/components/SettingsKit";
import { useHomePath } from "@/features/roles";
import { useMyReports } from "@/features/myReports";
import { useSmartClean } from "@/features/store";
import { colors, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

export default function MyReportsScreen() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { currentUser } = useSmartClean();
  const homePath = useHomePath();
  const { ready, reports } = useMyReports();
  if (!ready) return null;
  if (!currentUser) return <Redirect href={homePath as never} />;
  return (
    <Screen title="Reports">
      {reports.length === 0 ? (
        <Text style={styles.muted}>You have not been given any reports yet. Ask your manager.</Text>
      ) : (
        <SettingsSection title="Your reports">
          {reports.map((r) => (
            <SettingsRow key={r.key} icon={r.icon} title={r.title} sub={r.sub} onPress={() => router.push(r.to as never)} />
          ))}
        </SettingsSection>
      )}
    </Screen>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    muted: { fontSize: typography.body, color: colors.mutedForeground, padding: spacing.md },
  }),
);
