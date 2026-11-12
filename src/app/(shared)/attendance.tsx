import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { OnShiftNow } from "@/components/OnShiftNow";
import { Screen } from "@/components/Screen";
import { TimesheetView } from "@/components/TimesheetView";
import { useSmartClean } from "@/features/store";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

/**
 * Attendance for managers. "On shift now" sets who is on site against today's schedule; "Timesheet" is the week's
 * hours per person. Opened from the manager Overview's "On shift now" card; the web app's phone version is
 * ManageAttendanceMobile. Reads bootstrap, which the backend has already scoped to the manager's sites.
 */
export default function AttendanceNowScreen() {
  useThemeVersion();
  const { state, currentUser } = useSmartClean();
  const mySites = useMemo(() => {
    const scoped = currentUser?.siteIds ?? [];
    return scoped.length > 0 ? state.sites.filter((s) => scoped.includes(s.id)) : state.sites;
  }, [state.sites, currentUser]);
  const [view, setView] = useState<"now" | "timesheet">("now");

  return (
    <Screen title="Attendance">
      <View style={styles.tabs} accessibilityRole="tablist">
        {(
          [
            ["now", "On shift now"],
            ["timesheet", "Timesheet"],
          ] as const
        ).map(([id, label]) => (
          <Pressable
            key={id}
            accessibilityRole="tab"
            accessibilityState={{ selected: view === id }}
            onPress={() => setView(id)}
            style={[styles.tab, view === id && styles.tabOn]}
          >
            <Text style={[styles.tabText, view === id && styles.tabTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {view === "timesheet" ? <TimesheetView /> : <OnShiftNow sites={mySites} />}
    </Screen>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    tabs: { flexDirection: "row", gap: spacing.xs, padding: spacing.xs, marginBottom: spacing.md, borderRadius: radius.round, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    tab: { flex: 1, alignItems: "center", paddingVertical: spacing.sm, borderRadius: radius.round },
    tabOn: { backgroundColor: colors.primary },
    tabText: { fontSize: typography.body, fontWeight: "700", color: colors.mutedForeground },
    tabTextOn: { color: colors.primaryForeground },
  }),
);
