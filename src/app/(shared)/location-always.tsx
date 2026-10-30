import { useEffect, useState } from "react";
import { router } from "expo-router";
import { Linking, StyleSheet, Text, View } from "react-native";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { requestAlwaysPermission, trackingPermission, type TrackingPermission } from "@/features/geofenceClock";
import { colors, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

/** Explains why the app wants location "all the time" before the system asks for it. */
export default function LocationAlwaysScreen() {
  useThemeVersion();
  const [permission, setPermission] = useState<TrackingPermission>("unknown");
  useEffect(() => {
    void trackingPermission().then(setPermission);
  }, []);

  const allow = async () => setPermission(await requestAlwaysPermission());

  return (
    <Screen title="Automatic clock-out">
      <Card style={styles.card}>
        <Text style={styles.title}>Why this is needed</Text>
        <Text style={styles.body}>
          Your organisation counts your hours while you are on site. To clock you out when you leave (for lunch, say) and back in when you
          return, the app has to notice that even when it is closed.
        </Text>
        <Text style={styles.body}>
          Your location is used only to tell whether you are at your site. It is not shown to anyone else, and tracking stops when you are
          off the clock. While it runs you will see a notification from Šoma360.
        </Text>
        <Text style={styles.body}>
          When your phone asks, choose "Allow all the time". Without it the app only checks while it is open.
        </Text>
      </Card>
      {permission === "always" ? (
        <Text style={styles.ok}>Allowed. Automatic clocking is working.</Text>
      ) : permission === "denied" ? (
        <View style={styles.actions}>
          <Text style={styles.body}>Location is blocked for this app. Turn it on in your phone's settings.</Text>
          <Button onPress={() => Linking.openSettings()}>Open settings</Button>
        </View>
      ) : (
        <View style={styles.actions}>
          {permission === "foreground" && (
            <Text style={styles.body}>
              Location is only allowed while the app is open. In your phone's settings, set it to "Allow all the time".
            </Text>
          )}
          <Button onPress={allow}>Allow location all the time</Button>
          {permission === "foreground" && (
            <Button variant="outline" onPress={() => Linking.openSettings()}>
              Open settings
            </Button>
          )}
        </View>
      )}
      <Button variant="ghost" onPress={() => router.back()}>
        Close
      </Button>
    </Screen>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    card: { gap: spacing.sm },
    title: { fontSize: typography.h2, fontWeight: "700", color: colors.foreground },
    body: { fontSize: typography.body, color: colors.foreground },
    ok: { fontSize: typography.body, color: colors.success, fontWeight: "600", marginTop: spacing.md },
    actions: { gap: spacing.sm, marginTop: spacing.md },
  }),
);
