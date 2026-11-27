import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { appAlert } from "@/components/Dialog";
import { ReminderSettingsPanel } from "@/components/maintenance/ReminderSettingsPanel";
import { fuzzyFilter } from "@/domain/fuzzySearch";
import { useSmartClean } from "@/features/store";
import {
  getMaintenanceMe,
  listMaintenancePeople,
  setMaintenanceAccess,
  setMaintenanceSkipMode,
  type MaintenancePerson,
} from "@/api/client";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

type Key = "access" | "handle" | "approve" | "pay" | "override";

const COLUMNS: { key: Key; label: string }[] = [
  { key: "access", label: "Access" },
  { key: "handle", label: "Handle" },
  { key: "approve", label: "Approve" },
  { key: "pay", label: "Pay" },
  { key: "override", label: "Skip / close early" },
];
const PERSON_W = 170;
const COL_W = 92;

const SKIP_OPTIONS = [
  ["next", "One tap to the next stage", "They skip to the stage that comes next and give a reason."],
  ["choose", "They choose the step", "They pick any step to skip to and give a reason."],
] as const;

/**
 * Who has Maintenance. Nobody does until it is given here, one person at a time. Administrators and
 * operations managers always have all of it by their role. The server enforces every one of these.
 * Same as the PWA's Access tab.
 */
export function AccessView() {
  useThemeVersion();
  const { state } = useSmartClean();
  const token = state.accessToken;
  const [people, setPeople] = useState<MaintenancePerson[] | null>(null);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [skipMode, setSkipMode] = useState<"next" | "choose">("next");

  useEffect(() => {
    if (!token) return;
    getMaintenanceMe(token)
      .then((me) => setSkipMode(me.policy.skipMode === "choose" ? "choose" : "next"))
      .catch(() => undefined);
  }, [token]);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setPeople(await listMaintenancePeople(token));
    } catch (error) {
      appAlert("Could not load people", error instanceof Error ? error.message : "Try again in a moment.");
      setPeople([]);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(
    () =>
      [...fuzzyFilter(people ?? [], query, (p) => [p.name, p.role])]
        // People who have something first, so the answer to "who has access?" is at the top.
        .sort(
          (a, b) =>
            Number(b.byRole || b.grants.access) - Number(a.byRole || a.grants.access) ||
            a.name.localeCompare(b.name),
        ),
    [people, query],
  );

  async function changeSkipMode(mode: "next" | "choose") {
    if (!token) return;
    const before = skipMode;
    setSkipMode(mode);
    try {
      await setMaintenanceSkipMode(token, mode);
    } catch (error) {
      setSkipMode(before);
      appAlert("Could not save that", error instanceof Error ? error.message : "Please try again.");
    }
  }

  async function apply(person: MaintenancePerson, key: Key, value: boolean) {
    if (!token) return;
    setSaving(person.id + key);
    try {
      const result = await setMaintenanceAccess(token, person.id, { [key]: value });
      setPeople((current) =>
        (current ?? []).map((p) =>
          p.id === person.id ? { ...p, grants: result.maintenance as unknown as MaintenancePerson["grants"] } : p,
        ),
      );
      // The effective rights depend on policy too, so take the server's word for them.
      void load();
    } catch (error) {
      appAlert("Could not save that", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setSaving(null);
    }
  }

  function change(person: MaintenancePerson, key: Key, value: boolean) {
    if (key === "access" && !value && (person.grants.handle || person.grants.approve || person.grants.pay)) {
      appAlert(
        `Take away ${person.name}'s access?`,
        "This also removes their handle, approve and pay rights.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Remove access", style: "destructive", onPress: () => void apply(person, key, value) },
        ],
      );
      return;
    }
    void apply(person, key, value);
  }

  if (people === null) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      <Text style={styles.lead}>
        Maintenance is only for the people you choose. Administrators and operations managers always have all of it.
        Handling, approving and paying each include access.
      </Text>

      <View style={styles.box}>
        <Text style={styles.boxTitle}>When someone with &ldquo;Skip / close early&rdquo; skips a step</Text>
        {SKIP_OPTIONS.map(([value, title, hint]) => (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityState={{ selected: skipMode === value }}
            onPress={() => void changeSkipMode(value)}
            style={styles.radioRow}
          >
            <View style={[styles.radio, skipMode === value && styles.radioOn]}>
              {skipMode === value ? <View style={styles.radioDot} /> : null}
            </View>
            <View style={styles.flex}>
              <Text style={styles.radioTitle}>{title}</Text>
              <Text style={styles.muted}>{hint}</Text>
            </View>
          </Pressable>
        ))}
        <Text style={styles.muted}>Closing early, with a reason, is always available to them.</Text>
      </View>

      <ReminderSettingsPanel />

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Find a person or role"
        placeholderTextColor={colors.mutedForeground}
        accessibilityLabel="Find a person or role"
        style={styles.search}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.table}>
        <View>
          <View style={[styles.tr, styles.thead]}>
            <Text style={[styles.th, { width: PERSON_W }]}>PERSON</Text>
            {COLUMNS.map((c) => (
              <Text key={c.key} style={[styles.th, styles.center, { width: COL_W }]}>
                {c.label.toUpperCase()}
              </Text>
            ))}
          </View>
          {shown.map((person) => (
            <View key={person.id} style={[styles.tr, styles.trBorder]}>
              <View style={{ width: PERSON_W, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
                <Text style={styles.name}>{person.name}</Text>
                <Text style={styles.role}>{person.role.replace(/_/g, " ")}</Text>
              </View>
              {person.byRole ? (
                <View style={[styles.byRole, { width: COL_W * COLUMNS.length }]}>
                  <Text style={styles.muted}>Everything, by role</Text>
                </View>
              ) : (
                COLUMNS.map((c) => {
                  const needsRank = (c.key === "approve" || c.key === "pay") && !person.canBeGivenApprovalAndPay;
                  return (
                    <View key={c.key} style={[styles.cell, { width: COL_W }]}>
                      <Switch
                        value={person.grants[c.key]}
                        disabled={needsRank || saving === person.id + c.key}
                        accessibilityLabel={`${c.label} for ${person.name}`}
                        onValueChange={(value) => change(person, c.key, value)}
                        trackColor={{ true: colors.primary, false: colors.border }}
                      />
                    </View>
                  );
                })
              )}
            </View>
          ))}
          {shown.length === 0 ? (
            <View style={[styles.trBorder, styles.none, { width: PERSON_W + COL_W * COLUMNS.length }]}>
              <Text style={styles.muted}>No one found.</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    stack: { gap: spacing.md },
    flex: { flex: 1, minWidth: 0 },
    loading: { paddingVertical: 48, alignItems: "center" },
    lead: { fontSize: typography.body, color: colors.mutedForeground },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    box: { gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
    boxTitle: { fontSize: typography.body, fontWeight: "500", color: colors.foreground },
    radioRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 2 },
    radio: {
      width: 18,
      height: 18,
      marginTop: 1,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 9,
      borderWidth: 2,
      borderColor: colors.border,
    },
    radioOn: { borderColor: colors.primary },
    radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
    radioTitle: { fontSize: typography.body, fontWeight: "500", color: colors.foreground },
    search: {
      height: 40,
      maxWidth: 320,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      fontSize: 16,
      color: colors.foreground,
      backgroundColor: colors.card,
    },
    table: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, flexGrow: 0 },
    tr: { flexDirection: "row", alignItems: "center" },
    trBorder: { borderTopWidth: 1, borderTopColor: colors.border },
    thead: { backgroundColor: colors.muted },
    th: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: typography.small,
      fontWeight: "600",
      letterSpacing: 0.5,
      color: colors.mutedForeground,
    },
    center: { textAlign: "center" },
    name: { fontSize: typography.body, fontWeight: "500", color: colors.foreground },
    role: { fontSize: typography.small, color: colors.mutedForeground, textTransform: "capitalize" },
    cell: { alignItems: "center", justifyContent: "center", paddingVertical: spacing.sm },
    byRole: { alignItems: "center", justifyContent: "center", paddingVertical: spacing.sm },
    none: { alignItems: "center", paddingVertical: 24 },
  }),
);
