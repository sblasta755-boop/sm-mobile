import { useEffect, useMemo, useState } from "react";
import { Redirect } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { appAlert } from "@/components/Dialog";
import {
  listBookablePeople,
  listLeaveRequests,
  listSiteBookings,
  listSiteShifts,
  type LeaveRequest,
  type StaffBooking,
} from "@/api/client";
import { useSmartClean } from "@/features/store";
import { useCanBook, useScheduleOn } from "@/features/schedule";
import { useHomePath } from "@/features/roles";
import { useReportAccessState } from "@/features/reportAccess";
import { useTenantBranding } from "@/services/branding";
import { photoDataUri } from "@/services/reportPhotos";
import { fuzzyFilter } from "@/domain/fuzzySearch";
import { longDate } from "@/domain/managementReport";
import { stampReportFooter } from "@/domain/pdfFooter";
import { buildScheduleReportHtml } from "@/domain/scheduleReportHtml";
import {
  SCHEDULE_REPORTS,
  addDays,
  buildScheduleReport,
  reportCsv,
  reportRange,
  type ScheduleReportKind,
} from "@/domain/scheduleReports";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const MAX_DAYS = 92;

/**
 * Schedule reports from the phone: pick a report, a site and the dates, then share it as a PDF laid
 * out like the management report, or as a spreadsheet (CSV) that opens in Excel.
 */
export default function ScheduleReportScreen() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { state, currentUser } = useSmartClean();
  const on = useScheduleOn();
  const canBook = useCanBook();
  const homePath = useHomePath();
  const { grants: reportGrants, ready: reportsReady } = useReportAccessState();
  const branding = useTenantBranding();
  const sites = state.sites.filter((s) => s.active);
  const today = dayKey(new Date());
  const [kind, setKind] = useState<ScheduleReportKind>("weekly");
  const [siteId, setSiteId] = useState(() => sites[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(addDays(today, 6));
  const [userId, setUserId] = useState("");
  const [query, setQuery] = useState("");
  const [bookings, setBookings] = useState<StaffBooking[]>([]);
  const [leave, setLeave] = useState<LeaveRequest[]>([]);
  const [people, setPeople] = useState<{ id: string; name: string; role: string }[]>([]);
  const [shifts, setShifts] = useState<{ id: string; startTime: string; endTime: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const site = sites.find((s) => s.id === siteId) ?? sites[0];
  const token = state.accessToken;
  const usesRange = kind === "role" || kind === "individual" || kind === "leave";
  const range = reportRange(kind, date, start, end);
  const tooLong = (Date.parse(range.end) - Date.parse(range.start)) / 864e5 > MAX_DAYS;
  const badRange = range.start > range.end;

  useEffect(() => {
    if (!token || !site) return;
    let cancelled = false;
    Promise.all([listBookablePeople(token, site.id), listSiteShifts(token, site.id)])
      .then(([p, s]) => {
        if (cancelled) return;
        setPeople(p);
        setShifts(s.map((x) => ({ id: x.id, startTime: x.startTime, endTime: x.endTime })));
        setUserId((cur) => (p.some((x) => x.id === cur) ? cur : (p[0]?.id ?? "")));
      })
      .catch(() => !cancelled && setPeople([]));
    return () => {
      cancelled = true;
    };
  }, [token, site]);

  useEffect(() => {
    if (!token || !site || tooLong || badRange) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    const load =
      kind === "leave"
        ? listLeaveRequests(token, { siteId: site.id, start: range.start, end: range.end }).then(
            (next) => !cancelled && setLeave(next),
          )
        : listSiteBookings(token, range.start, range.end, site.id).then(
            (next) => !cancelled && setBookings(next),
          );
    load
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Could not load the schedule."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token, site, kind, range.start, range.end, tooLong, badRange]);

  const roles = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p.role])), [people]);
  const report = useMemo(
    () =>
      site
        ? buildScheduleReport({
            kind,
            siteName: site.name,
            date,
            start,
            end,
            bookings,
            leave,
            roles,
            shifts,
            userId,
          })
        : null,
    [kind, site, date, start, end, bookings, leave, roles, shifts, userId],
  );
  const shownPeople = useMemo(
    () => fuzzyFilter(people, query, (p) => [p.name, p.role.replace(/_/g, " ")]),
    [people, query],
  );

  if (!reportsReady) return null;
  if (!currentUser || !on || !(canBook || reportGrants.schedule)) return <Redirect href={homePath as never} />;

  const empty = !report || report.groups.length === 0;
  const blocked = empty || loading || tooLong || badRange || !!busy;

  const share = async (uri: string, mimeType: string, title: string, uti: string) => {
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType, dialogTitle: title, UTI: uti });
    else appAlert("Report ready", "Sharing isn't available on this device.");
  };

  async function makePdf() {
    if (!report || !site) return;
    setBusy("pdf");
    try {
      const now = new Date();
      // The logo is embedded: the print engine may not fetch it in time.
      const logoData = branding.logoUrl ? await photoDataUri(branding.logoUrl).catch(() => null) : null;
      const html = buildScheduleReportHtml({
        report,
        siteName: site.name,
        siteAddress: site.address ?? "",
        clientName: branding.name,
        clientLogoUrl: logoData ?? branding.logoUrl,
        generatedAtLabel: `${longDate(dayKey(now)).toUpperCase()} | ${pad(now.getHours())}:${pad(now.getMinutes())}`,
        preparedBy: currentUser?.name ?? "",
      });
      // A4 explicitly: Android's print engine defaults to Letter.
      const printed = await Print.printToFileAsync({ html, base64: true, width: 595, height: 842 });
      const stamped = await stampReportFooter(printed.base64 ?? "", site.name, report.title, "Schedule");
      const uri = `${FileSystem.cacheDirectory}${report.filename}.pdf`;
      await FileSystem.writeAsStringAsync(uri, stamped, { encoding: FileSystem.EncodingType.Base64 });
      await share(uri, "application/pdf", report.title, "com.adobe.pdf");
    } catch (e) {
      appAlert("Could not create the report", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy("");
    }
  }

  async function makeCsv() {
    if (!report) return;
    setBusy("csv");
    try {
      const uri = `${FileSystem.cacheDirectory}${report.filename}.csv`;
      await FileSystem.writeAsStringAsync(uri, reportCsv(report), { encoding: FileSystem.EncodingType.UTF8 });
      await share(uri, "text/csv", report.title, "public.comma-separated-values-text");
    } catch (e) {
      appAlert("Could not create the file", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy("");
    }
  }

  return (
    <Screen title="Schedule reports">
      <Text style={styles.intro}>
        Rosters and leave decisions for one site. Share a PDF laid out like the management report, or a
        spreadsheet that opens in Excel.
      </Text>

      <Card style={styles.card}>
        <Text style={styles.label}>Report</Text>
        <View style={styles.chips}>
          {SCHEDULE_REPORTS.map((r) => (
            <Chip key={r.kind} label={r.label} on={kind === r.kind} onPress={() => setKind(r.kind)} />
          ))}
        </View>
      </Card>

      {sites.length > 1 && (
        <Card style={styles.card}>
          <Text style={styles.label}>Site</Text>
          <View style={styles.chips}>
            {sites.map((s) => (
              <Chip key={s.id} label={s.name} on={site?.id === s.id} onPress={() => setSiteId(s.id)} />
            ))}
          </View>
        </Card>
      )}

      <Card style={styles.card}>
        {usesRange ? (
          <>
            <Stepper label="From" value={start} onChange={(v) => setStart(v)} />
            <Stepper label="To" value={end} onChange={(v) => setEnd(v)} />
          </>
        ) : (
          <Stepper
            label={kind === "daily" ? "Day" : kind === "weekly" || kind === "roster" ? "Week containing" : "Month containing"}
            value={date}
            onChange={setDate}
            stepDays={kind === "daily" ? 1 : kind === "weekly" || kind === "roster" ? 7 : 28}
          />
        )}
        {report && !usesRange && <Text style={styles.muted}>{report.period}</Text>}
        {badRange && <Text style={styles.warn}>The end date is before the start date.</Text>}
        {tooLong && <Text style={styles.warn}>Choose a period of 93 days or less.</Text>}
      </Card>

      {kind === "individual" && (
        <Card style={styles.card}>
          <Text style={styles.label}>Person</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name or role"
            placeholderTextColor={colors.mutedForeground}
            accessibilityLabel="Search people"
            style={styles.input}
          />
          <View style={styles.chips}>
            {shownPeople.slice(0, 30).map((p) => (
              <Chip key={p.id} label={p.name} on={userId === p.id} onPress={() => setUserId(p.id)} />
            ))}
          </View>
          {shownPeople.length === 0 && <Text style={styles.muted}>No one matches</Text>}
        </Card>
      )}

      <Card style={styles.card}>
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : error ? (
          <Text style={styles.warn}>{error}</Text>
        ) : empty ? (
          <Text style={styles.muted}>
            Nothing to report at {site?.name ?? "this site"} for this period. Change the dates or the report.
          </Text>
        ) : (
          <View style={styles.summary}>
            {report!.kpis.map((k) => (
              <View key={k.label} style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{k.value}</Text>
                <Text style={styles.muted}>{k.label}</Text>
              </View>
            ))}
          </View>
        )}
      </Card>

      <Button
        icon={<Ionicons name="document-text-outline" size={18} color={colors.primaryForeground} />}
        disabled={blocked}
        loading={busy === "pdf"}
        onPress={() => void makePdf()}
      >
        PDF
      </Button>
      <View style={{ height: spacing.sm }} />
      <Button
        variant="outline"
        icon={<Ionicons name="grid-outline" size={18} color={colors.primary} />}
        disabled={blocked}
        loading={busy === "csv"}
        onPress={() => void makeCsv()}
      >
        Spreadsheet (opens in Excel)
      </Button>
    </Screen>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={[styles.chip, on && styles.chipOn]}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

function Stepper({
  label,
  value,
  onChange,
  stepDays = 1,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  stepDays?: number;
}) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.dateRow}>
        <Pressable accessibilityLabel={`${label}: earlier`} onPress={() => onChange(addDays(value, -stepDays))} style={styles.step}>
          <Ionicons name="chevron-back" size={18} color={colors.foreground} />
        </Pressable>
        <Text style={styles.dateText}>{longDate(value)}</Text>
        <Pressable accessibilityLabel={`${label}: later`} onPress={() => onChange(addDays(value, stepDays))} style={styles.step}>
          <Ionicons name="chevron-forward" size={18} color={colors.foreground} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    intro: { fontSize: typography.small, color: colors.mutedForeground, marginBottom: spacing.md },
    card: { gap: spacing.sm, marginBottom: spacing.md },
    label: { fontSize: typography.small, fontWeight: "700", color: colors.foreground },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    warn: { fontSize: typography.small, color: colors.destructive },
    dateRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
    dateText: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    step: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      alignItems: "center",
      justifyContent: "center",
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.card,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      fontSize: typography.body,
      color: colors.foreground,
    },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: typography.small, fontWeight: "600", color: colors.mutedForeground },
    chipTextOn: { color: colors.primaryForeground },
    summary: { flexDirection: "row", justifyContent: "space-around" },
    summaryItem: { alignItems: "center" },
    summaryValue: { fontSize: 22, fontWeight: "800", color: colors.foreground },
  }),
);
