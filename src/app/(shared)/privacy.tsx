import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { colors, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

// Previously the profile menu's "Privacy & POPIA notice" row was a no-op
// (onPress={() => {}}) - this is the real screen it now pushes to. Text
// mirrors the web app's shared copy (see smart-property-operations/src/lib/
// smartclean/privacyNotice.ts) - keep both in sync if either changes.
const PRIVACY_NOTICE_PARAGRAPHS = [
  "Šoma360 collects the operational data needed to run your sites: your account details, attendance events (QR scans, times and, where your organisation has switched it on, GPS position), task photos and checklist evidence, incident reports, leave and overtime requests, and an audit log. Where proof of presence or automatic clock-in is on, your position is sent every few minutes while you are clocked in, and the Android app can do this in the background. Your organisation is the responsible party for this data and Šoma360 processes it on its behalf.",
  "Emails and notifications are sent through the mail and push services this deployment is configured with. Maps and directions use OpenStreetMap-based services, which see your IP address and, for directions, your position. The web app sets no cookies and uses no analytics or advertising trackers; it keeps your session and preferences in your browser storage.",
  "Under POPIA you may request access to, correction of, or deletion of your personal information, object to processing, or complain to the Information Regulator. Ask your organisation's Šoma360 administrator or write to us. Sign-in sessions expire after 14 days, visitor contact details left through wayfinding are deleted after 30 days, and other retention is currently managed by your administrator rather than an automatic schedule. The full policy is at /privacy.",
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
