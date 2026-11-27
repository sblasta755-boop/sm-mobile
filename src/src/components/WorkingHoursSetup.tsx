import { useEffect, useState } from "react";
import { StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { InheritRow } from "@/components/InheritRow";
import { appAlert } from "@/components/Dialog";
import { saveOrgOperations, saveSiteOperations, type OrgOperations } from "@/api/client";
import { siteOperationsPayload } from "@/domain/operatingCalendar";
import { useSmartClean } from "@/features/store";
import type { Site } from "@/types/smartclean";
import { colors, radius, spacing, typography, themedStyles } from "@/theme";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const FALLBACK = { start: "07:00", end: "16:00" };
const label = (h: { start: string; end: string }) => `${h.start} to ${h.end}${h.end <= h.start ? " (next day)" : ""}`;
// 0600 -> 06:00 as the person types.
const clock = (text: string) => {
  const digits = text.replace(/[^0-9]/g, "").slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
};

/**
 * Expected shift start and end: the organisation's default, which a site follows or replaces with its own. Shown on
 * the cleaner's home screen and used to flag anyone who has not clocked in shortly after the shift starts. A site that
 * runs past midnight can end earlier than it starts.
 */
export function WorkingHoursSetup({
  site,
  org,
  canEditOrg,
  onOrgSaved,
}: {
  /** The site being edited, or undefined for the organisation default. */
  site?: Site;
  org: OrgOperations | null;
  canEditOrg: boolean;
  onOrgSaved: (next: OrgOperations) => void;
}) {
  const { state, refreshBackendData } = useSmartClean();
  const token = state.accessToken;
  const orgHours = org?.workingHours ?? null;
  const ownHours = site?.calendarOverride?.workingHours ? (site.workingHours ?? null) : null;
  const [inherit, setInherit] = useState(site ? !ownHours : orgHours === null);
  const shownNow = site ? (ownHours ?? orgHours) : orgHours;
  const [start, setStart] = useState(shownNow?.start ?? FALLBACK.start);
  const [end, setEnd] = useState(shownNow?.end ?? FALLBACK.end);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setInherit(site ? !ownHours : orgHours === null);
    setStart(shownNow?.start ?? FALLBACK.start);
    setEnd(shownNow?.end ?? FALLBACK.end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site?.id, ownHours?.start, ownHours?.end, orgHours?.start, orgHours?.end]);

  const readOnly = !site && !canEditOrg;
  const locked = !!site && inherit;
  const shown = locked ? (orgHours ?? FALLBACK) : { start, end };

  const save = async () => {
    if (!token) return;
    const wanted = inherit ? null : { start, end };
    if (wanted && (!HHMM.test(wanted.start) || !HHMM.test(wanted.end) || wanted.start === wanted.end)) {
      appAlert("Check the hours", "Use times such as 07:00 and 16:00. Start and end cannot be the same.");
      return;
    }
    setBusy(true);
    try {
      if (site) await saveSiteOperations(token, site.id, siteOperationsPayload(site, { workingHours: wanted }));
      else if (org) onOrgSaved(await saveOrgOperations(token, { ...org, workingHours: wanted }));
      await refreshBackendData();
      appAlert("Working hours saved", undefined, undefined, "success");
    } catch (error) {
      appAlert("Could not save", error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={styles.section}>
      <View style={styles.head}>
        <Ionicons name="time-outline" size={18} color={colors.primary} />
        <Text style={styles.title}>Working hours</Text>
      </View>
      <Text style={styles.muted}>
        Expected shift start and end, for people with no booking. A booked shift uses its own hours. A site that runs past midnight can end
        earlier than it starts.
      </Text>
      {site ? (
        <InheritRow inherit={inherit} onChange={setInherit} current={orgHours ? label(orgHours) : "not set"} />
      ) : (
        <View style={styles.switchRow}>
          <View style={styles.copy}>
            <Text style={styles.strong}>Set default working hours</Text>
            <Text style={styles.muted}>Sites follow these unless they set their own.</Text>
          </View>
          <Switch
            value={!inherit}
            onValueChange={(on) => setInherit(!on)}
            disabled={readOnly}
            trackColor={{ true: colors.primary, false: colors.neutral }}
            accessibilityLabel="Set default working hours"
          />
        </View>
      )}
      {(site || !inherit) && (
        <View style={styles.pair}>
          <TextInput
            style={[styles.input, styles.flex, (locked || readOnly) && styles.dim]}
            value={shown.start}
            editable={!locked && !readOnly}
            onChangeText={(t) => setStart(clock(t))}
            keyboardType="number-pad"
            maxLength={5}
            placeholder="07:00"
            placeholderTextColor={colors.mutedForeground}
            accessibilityLabel="Starts"
          />
          <TextInput
            style={[styles.input, styles.flex, (locked || readOnly) && styles.dim]}
            value={shown.end}
            editable={!locked && !readOnly}
            onChangeText={(t) => setEnd(clock(t))}
            keyboardType="number-pad"
            maxLength={5}
            placeholder="16:00"
            placeholderTextColor={colors.mutedForeground}
            accessibilityLabel="Ends"
          />
        </View>
      )}
      <Button onPress={save} disabled={busy || readOnly || !org}>
        Save working hours
      </Button>
    </Card>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    section: { padding: spacing.lg, gap: spacing.md },
    head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    title: { fontSize: typography.h2, fontWeight: "600", color: colors.foreground },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    strong: { fontSize: typography.body, fontWeight: "600", color: colors.foreground },
    copy: { flex: 1, gap: 2 },
    switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    pair: { flexDirection: "row", gap: spacing.sm },
    flex: { flex: 1 },
    dim: { opacity: 0.55 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.card,
      color: colors.foreground,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: 16,
      minHeight: 44,
      textAlign: "center",
    },
  }),
);
