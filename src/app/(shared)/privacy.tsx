import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { colors, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

// Previously the profile menu's "Privacy & POPIA notice" row was a no-op
// (onPress={() => {}}) - this is the real screen it now pushes to. Text
// mirrors the web app's shared copy (see smart-property-operations/src/lib/
// smartclean/privacyNotice.ts) - keep both in sync if either changes.
const PRIVACY_NOTICE_PARAGRAPHS = [
  "Šoma360 collects operational data needed to run cleaning services at your sites: attendance events (QR scan + timestamp; GPS is only recorded where a device supplies it), task photos and checklist evidence, incident reports, and account/audit logs. Emails you receive (invites, password resets, incident and corrective-action alerts) are sent through this deployment's configured mail service.",
  "Under POPIA you may request access to, correction of, or deletion of your personal information by contacting your organisation's Šoma360 administrator. Retention and deletion are currently handled manually by your administrator rather than by an automated policy.",
];

export default function PrivacyScreen() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  return (
    <Screen title="Privacy & POPIA notice" scroll={false}>
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <Text style={styles.heading}>Privacy notice (POPIA)</Text>
          <View style={styles.paragraphs}>
            {PRIVACY_NOTICE_PARAGRAPHS.map((paragraph, i) => (
              <Text key={i} style={styles.paragraph}>
                {paragraph}
              </Text>
            ))}
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  content: {
    padding: spacing.md,
  },
  heading: {
    fontSize: typography.h2,
    fontWeight: "700",
    color: colors.foreground,
    marginBottom: spacing.sm,
  },
  paragraphs: {
    gap: spacing.sm,
  },
  paragraph: {
    fontSize: typography.small,
    color: colors.mutedForeground,
    lineHeight: 18,
  },
}));
