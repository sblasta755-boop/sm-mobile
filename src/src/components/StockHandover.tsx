import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { SelectField } from "@/components/SelectField";
import { appAlert } from "@/components/Dialog";
import { useSmartClean } from "@/features/store";
import {
  assignStockCountLines,
  getStockHandoverReport,
  listStockCountHelpers,
  listStockShifts,
} from "@/api/client";
import type { StockCountSession, StockCountHelper, StockHandoverReport, StockShift } from "@/types/smartclean";
import { colors, radius, spacing, typography, themedStyles } from "@/theme";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong");
const money = (value: number) => value.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed = (value: number) => (value > 0 ? `+${value}` : String(value));

/** Loads the site's shifts. Empty when it has none (or there is no signal). */
export function useSiteShifts(siteId: string, version = 0) {
  const { state } = useSmartClean();
  const [shifts, setShifts] = useState<StockShift[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!state.accessToken || !siteId) return;
    let live = true;
    listStockShifts(state.accessToken, siteId)
      .then((next) => live && setShifts(next))
      .catch(() => live && setShifts([]))
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, [state.accessToken, siteId, version]);
  return { shifts, loaded };
}

/** Where a count starts: the handover for a shift, or a short spot check. */
export function HandoverStart({
  shifts,
  onStart,
}: {
  shifts: StockShift[];
  onStart: (options: { kind: "handover" | "cycle"; shiftId?: string }) => void;
}) {
  const choices = ["The shift running now", ...shifts.map((s) => `${s.name} (${s.startTime} to ${s.endTime})`)];
  const [choice, setChoice] = useState(choices[0]);
  const picked = shifts.find((s) => choice.startsWith(`${s.name} (`));

  return (
    <View style={styles.stack}>
      {shifts.length > 0 && (
        <Card style={styles.section}>
          <View style={styles.sectionHead}>
            <Ionicons name="swap-horizontal-outline" size={18} color={colors.primary} />
            <Text style={styles.sectionTitle}>Shift handover count</Text>
          </View>
          <Text style={styles.muted}>
            Count everything at the start of your shift. It is checked against the last shift's count, plus the deliveries, issues and waste recorded since, so only real gaps are flagged.
          </Text>
          {shifts.length > 1 && <SelectField label="Shift" value={choice} options={choices} onChange={setChoice} searchable={false} />}
          <Button onPress={() => onStart({ kind: "handover", ...(picked ? { shiftId: picked.id } : {}) })}>Start handover count</Button>
        </Card>
      )}
      <Card style={styles.section}>
        <View style={styles.sectionHead}>
          <Ionicons name="search-outline" size={18} color={colors.primary} />
          <Text style={styles.sectionTitle}>Spot check</Text>
        </View>
        <Text style={styles.muted}>A short list of the lines most worth checking: high value, not counted lately, or with unexplained gaps before.</Text>
        <Button variant={shifts.length > 0 ? "outline" : "primary"} onPress={() => onStart({ kind: "cycle" })}>
          Start a spot check
        </Button>
      </Card>
    </View>
  );
}

/** A supervisor gives the lines at one place to a colleague, who counts only those. */
export function AssignHelpers({
  count,
  locationName,
  onChanged,
}: {
  count: StockCountSession;
  locationName: (id: string) => string;
  onChanged: (next: StockCountSession) => void;
}) {
  const { state } = useSmartClean();
  const token = state.accessToken;
  const [helpers, setHelpers] = useState<StockCountHelper[]>([]);
  const [place, setPlace] = useState("");
  const [person, setPerson] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    let live = true;
    listStockCountHelpers(token, count.siteId, count.id)
      .then((next) => live && setHelpers(next))
      .catch(() => live && setHelpers([]));
    return () => {
      live = false;
    };
  }, [token, count.siteId]);

  const placeIds = [...new Set(count.lines.map((l) => l.locationId))];
  const placeOptions = placeIds.map(locationName);
  const label = (h: StockCountHelper) => (h.booked ? `${h.name} (booked this shift)` : h.name);
  const personOptions = ["Nobody (back to me)", ...helpers.map(label)];

  const assign = async () => {
    if (!token) return;
    const locationId = placeIds.find((id) => locationName(id) === place);
    if (!locationId || !person) {
      appAlert("Choose both", "Pick the place and who should count it.");
      return;
    }
    const helper = helpers.find((h) => label(h) === person);
    setBusy(true);
    try {
      const next = await assignStockCountLines(
        token,
        count.id,
        helper?.id ?? null,
        count.lines.filter((l) => l.locationId === locationId).map((l) => l.id),
      );
      onChanged(next);
      appAlert("Assigned", helper ? `${helper.name} has been asked to count the lines at ${place}.` : "Those lines are back with you.", undefined, "success");
    } catch (error) {
      appAlert("Could not assign", errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const helpersAssigned = count.lines.filter((l) => l.assigneeId && l.counted == null).length;
  return (
    <Card style={styles.section}>
      <View style={styles.sectionHead}>
        <Ionicons name="people-outline" size={18} color={colors.primary} />
        <Text style={styles.sectionTitle}>Get help counting</Text>
      </View>
      <Text style={styles.muted}>
        Give the lines at one place to a colleague. They count only those lines, then you submit.
        {helpersAssigned > 0 ? ` ${helpersAssigned} still with helpers.` : ""}
      </Text>
      <SelectField label="Lines at" value={place} options={placeOptions} onChange={setPlace} />
      <SelectField label="Give to" value={person} options={personOptions} onChange={setPerson} />
      <Button variant="outline" onPress={assign} disabled={busy}>
        Assign
      </Button>
      {helpers.length === 0 && <Text style={styles.muted}>No one at this site is set up for stock yet.</Text>}
    </Card>
  );
}

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("en-CA");
};

/** The handover report on the phone: the figures and what did not match. Print it from the web. */
export function HandoverReportView({ siteId }: { siteId: string }) {
  const { state } = useSmartClean();
  const token = state.accessToken;
  const [days, setDays] = useState("14");
  const [report, setReport] = useState<StockHandoverReport | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    if (!token || !siteId) return;
    setFailed(false);
    getStockHandoverReport(token, siteId, daysAgo(Number(days) - 1), daysAgo(0))
      .then(setReport)
      .catch((error) => {
        setReport(null);
        setFailed(true);
        appAlert("Could not build the report", errorMessage(error));
      });
  }, [token, siteId, days]);
  useEffect(load, [load]);

  if (failed) return <Text style={styles.muted}>The report could not be loaded. Check your connection and try again.</Text>;
  if (!report) return <Text style={styles.muted}>Building the report…</Text>;
  if (report.shifts.length === 0) return <Text style={styles.muted}>This site has no shifts yet, so there are no handovers to report.</Text>;

  const s = report.summary;
  const withGaps = report.handovers.filter((h) => h.flagged.length > 0);
  return (
    <View style={styles.stack}>
      <SelectField label="Period" value={`Last ${days} days`} options={["Last 7 days", "Last 14 days", "Last 30 days"]} onChange={(v) => setDays(v.replace(/\D/g, ""))} searchable={false} />
      <View style={styles.statGrid}>
        <Stat label="Handovers done" value={String(s.handoversDone)} />
        <Stat label="Missed" value={String(s.missed)} bad={s.missed > 0} />
        <Stat label="Completion" value={s.completionRate == null ? "-" : `${Math.round(s.completionRate * 100)}%`} />
        <Stat label="With gaps" value={String(s.withIrregularities)} bad={s.withIrregularities > 0} />
        <Stat label="Lines off" value={String(s.flaggedLines)} />
        <Stat label="Value of gaps" value={money(s.flaggedCost)} bad={s.flaggedCost > 0} />
      </View>
      {s.unresolvedLines > 0 && <Text style={styles.warn}>{s.unresolvedLines} gap(s) still need a reason or an approval.</Text>}

      <Text style={styles.sectionTitle}>By shift</Text>
      {report.byShift.map((row) => (
        <Card key={row.shiftId} style={styles.listCard}>
          <Text style={styles.rowTitle}>{row.shiftName}</Text>
          <Text style={styles.muted}>
            {row.completed} of {row.expected} done · {row.missed} missed · {row.flaggedLines} lines off · {money(row.flaggedCost)}
          </Text>
        </Card>
      ))}

      <Text style={styles.sectionTitle}>Irregularities</Text>
      {withGaps.length === 0 && <Text style={styles.muted}>Every handover matched within tolerance.</Text>}
      {withGaps.map((h) => (
        <Card key={h.id} style={styles.listCard}>
          <Text style={styles.rowTitle}>
            {h.shiftName}, {h.countDate}
          </Text>
          <Text style={styles.muted}>{h.previousShiftName ? `Checked against ${h.previousShiftName}` : "First handover"}</Text>
          {h.flagged.map((l) => (
            <View key={l.lineId} style={styles.gap}>
              <Text style={styles.gapName}>{l.itemName}</Text>
              <Text style={styles.muted}>
                {l.locationName} · last shift {l.previousCounted ?? "-"}, since {l.movementNet == null ? "-" : signed(l.movementNet)}, expected {l.expected ?? "-"}, counted {l.counted ?? "-"}
              </Text>
              <Text style={[styles.gapValue, (l.variance ?? 0) < 0 && styles.bad]}>
                {l.variance == null ? "-" : signed(l.variance)} · {money(l.cost)} · {l.reasonLabel ?? "No reason yet"}
              </Text>
            </View>
          ))}
        </Card>
      ))}

      <Text style={styles.sectionTitle}>Missed handovers</Text>
      {report.missed.length === 0 && <Text style={styles.muted}>None missed.</Text>}
      {report.missed.map((m) => (
        <Card key={`${m.date}-${m.shiftName}`} style={styles.listCard}>
          <Text style={styles.rowTitle}>
            {m.shiftName}, {m.date}
          </Text>
          <Text style={styles.bad}>{m.started ? "Started but never submitted" : "No count was taken"}</Text>
        </Card>
      ))}

      {report.hotspots.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Items that keep turning up</Text>
          {report.hotspots.slice(0, 8).map((h) => (
            <Card key={`${h.itemName}-${h.locationName}`} style={styles.listCard}>
              <Text style={styles.rowTitle}>{h.itemName}</Text>
              <Text style={styles.muted}>
                {h.locationName} · flagged {h.timesFlagged}x · {signed(h.units)} units · {money(h.cost)}
              </Text>
            </Card>
          ))}
        </>
      )}
      <Text style={styles.muted}>For a printable copy, open the shift handover report on the web.</Text>
    </View>
  );
}

function Stat({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, bad && styles.bad]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    stack: { gap: spacing.md },
    section: { padding: spacing.lg, gap: spacing.md },
    sectionHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    sectionTitle: { fontSize: typography.h2, fontWeight: "600", color: colors.foreground },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    warn: { fontSize: typography.small, color: colors.destructive },
    bad: { color: colors.destructive },
    shiftRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    shiftName: { flex: 1 },
    shiftTime: { width: 72, textAlign: "center" },
    remove: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
    actions: { flexDirection: "row", gap: spacing.sm },
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
    },
    statGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    stat: { width: "31%", flexGrow: 1, backgroundColor: colors.secondary, borderRadius: radius.xl, paddingVertical: spacing.md, alignItems: "center" },
    statValue: { fontSize: typography.h1, fontWeight: "700", color: colors.foreground },
    statLabel: { fontSize: typography.small, color: colors.mutedForeground, textAlign: "center" },
    listCard: { padding: spacing.md, gap: spacing.xs },
    rowTitle: { fontSize: typography.body, fontWeight: "600", color: colors.foreground },
    gap: { paddingTop: spacing.sm, gap: 2, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    gapName: { fontSize: typography.body, fontWeight: "600", color: colors.foreground },
    gapValue: { fontSize: typography.small, fontWeight: "600", color: colors.foreground },
  }),
);
