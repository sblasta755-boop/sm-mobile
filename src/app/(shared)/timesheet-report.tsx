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
  getAttendanceTimesheet,
  listBookablePeople,
  listLeaveRequests,
  listSiteBookings,
  listSiteShifts,
  type LeaveRequest,
  type StaffBooking,
  type TimesheetDay,
} from "@/api/client";
import { fuzzyFilter } from "@/domain/fuzzySearch";
import { useSmartClean } from "@/features/store";
import { useHomePath } from "@/features/roles";
import { useReportAccessState } from "@/features/reportAccess";
import { useTenantBranding } from "@/services/branding";
import { photoDataUri } from "@/services/reportPhotos";
import { longDate } from "@/domain/managementReport";
import { stampReportFooter } from "@/domain/pdfFooter";
import { buildScheduleReportHtml } from "@/domain/scheduleReportHtml";
import type { AttDay } from "@/domain/attendanceReports";
import { reportCsv } from "@/domain/scheduleReports";
import {
  TIMESHEET_MAX_DAYS,
  TIMESHEET_REPORTS,
  buildTimesheetReport,
  timesheetRange,
  type TimesheetReportKind,
} from "@/domain/timesheetReports";
import { addDays } from "@/domain/scheduleDates";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const MANAGERS = ["org_admin", "operations_manager", "site_manager", "supervisor"];
/** The same day number one month on, kept inside the month. */
const shiftMonth = (day: string, by: number) => {
  const [y, m] = day.split("-").map(Number);
  return dayKey(new Date(y, m - 1 + by, 1));
};

/**
 * Timesheet reports from the phone: weekly and monthly timesheets, scheduled against actual hours, and the
 * approval audit. Share a PDF laid out like the management report (with charts and analysis), or a spreadsheet.
 */
export default function TimesheetReportScreen() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { state, currentUser } = useSmartClean();
  const homePath = useHomePath();
  const { grants: reportGrants, ready: reportsReady } = useReportAccessState();
  const branding = useTenantBranding();
  const sites = state.sites.filter((s) => s.active);
  const today = dayKey(new Date());
  const [kind, setKind] = useState<TimesheetReportKind>("weekly");
  const [siteId, setSiteId] = useState(() => sites[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [start, setStart] = useState(addDays(today, -6));
  const [end, setEnd] = useState(today);
  const [userId, setUserId] = useState("");
  const [query, setQuery] = useState("");
  const [days, setDays] = useState<AttDay[]>([]);
  const [bookings, setBookings] = useState<StaffBooking[]>([]);
  const [leave, setLeave] = useState<LeaveRequest[]>([]);
  const [people, setPeople] = useState<{ id: string; name: string; role: string }[]>([]);
  const [shifts, setShifts] = useState<{ id: string; startTime: string; endTime: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const site = sites.find((s) => s.id === siteId) ?? sites[0];
  const token = state.accessToken;
  const def = TIMESHEET_REPORTS.find((r) => r.kind === kind)!;
  const usesRange = kind === "variance" || kind === "audit";
  const range = timesheetRange(kind, date, start, end);
  const span = (Date.parse(range.end) - Date.parse(range.start)) / 864e5;
  const tooLong = span > TIMESHEET_MAX_DAYS - 1;
  const badRange = range.start > range.end;
  const needsPlan = kind !== "audit";

  useEffect(() => {
    if (!token || !site) return;
    let cancelled = false;
    Promise.all([listBookablePeople(token, site.id).catch(() => []), listSiteShifts(token, site.id).catch(() => [])]).then(([p, s]) => {
      if (cancelled) return;
      setPeople(p);
      setShifts(s.map((x) => ({ id: x.id, startTime: x.startTime, endTime: x.endTime })));
    });
    return () => {
      cancelled = true;
    };
  }, [token, site]);

  useEffect(() => {
    if (!token || !site || tooLong || badRange) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([
      getAttendanceTimesheet(token, range.start, range.end, site.id),
      // Scheduling or leave may be switched off for this organisation: then there is nothing to plan against.
      needsPlan ? listSiteBookings(token, range.start, range.end, site.id).catch(() => [] as StaffBooking[]) : Promise.resolve([] as StaffBooking[]),
      needsPlan
        ? listLeaveRequests(token, { siteId: site.id, start: range.start, end: range.end }).catch(() => [] as LeaveRequest[])
        : Promise.resolve([] as LeaveRequest[]),
    ])
      .then(([sheet, b, l]) => {
        if (cancelled) return;
        setDays(sheet.days as TimesheetDay[] as AttDay[]);
        setBookings(b);
        setLeave(l);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Could not load the timesheet."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token, site, range.start, range.end, tooLong, badRange, needsPlan]);

  const roles = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p.role])), [people]);
  const report = useMemo(
    () =>
      site
        ? buildTimesheetReport({
            kind,
            siteName: site.name,
            today,
            date,
            start,
            end,
            userId: kind === "monthly" ? userId : "",
            days,
            bookings: bookings.map((b) => ({
              userId: b.userId,
              userName: b.userName,
              date: b.date,
              status: b.status,
              startTime: b.startTime,
              endTime: b.endTime,
              shiftIds: b.shiftIds,
              shiftNames: b.shiftNames,
            })),
            leave: leave.map((l) => ({ userId: l.userId, userName: l.userName, startDate: l.startDate, endDate: l.endDate, status: l.status })),
            shifts,
            roles,
          })
        : null,
    [kind, site, today, date, start, end, userId, days, bookings, leave, shifts, roles],
  );
  const shownPeople = useMemo(() => fuzzyFilter(people, query, (p) => [p.name, p.role.replace(/_/g, " ")]), [people, query]);

  if (!reportsReady) return null;
  if (!currentUser || !(MANAGERS.includes(currentUser.role) || reportGrants.timesheet)) return <Redirect href={homePath as never} />;

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
      const stamped = await stampReportFooter(printed.base64 ?? "", site.name, report.title, "Timesheet");
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
    <Screen title="Timesheet reports">
      <Text style={styles.intro}>
        Hours worked, booked against actual, and the approval record for one site. Share a PDF with charts and
        analysis, or a spreadsheet that opens in Excel.
      </Text>

      <Card style={styles.card}>
        <Text style={styles.label}>Report</Text>
        <View style={styles.chips}>
          {TIMESHEET_REPORTS.map((r) => (
            <Chip key={r.kind} label={r.label} on={kind === r.kind} onPress={() => setKind(r.kind)} />
          ))}
        </View>
        <Text style={styles.muted}>{def.hint}</Text>
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
            <Stepper label="From" value={start} onChange={setStart} />
            <Stepper label="To" value={end} onChange={setEnd} />
          </>
        ) : kind === "weekly" ? (
          <Stepper label="Week containing" value={date} onChange={setDate} step={7} />
        ) : (
          <Stepper label="Month" value={date} onChange={setDate} monthly />
        )}
        {report && !usesRange && <Text style={styles.muted}>{report.period}</Text>}
        {badRange && <Text style={styles.warn}>The end date is before the start date.</Text>}
        {tooLong && <Text style={styles.warn}>Choose a period of {TIMESHEET_MAX_DAYS} days or less.</Text>}
      </Card>

      {kind === "monthly" && (
        <Card style={styles.card}>
          <Text style={styles.label}>Employee</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name or role"
            placeholderTextColor={colors.mutedForeground}
            accessibilityLabel="Search people"
            style={styles.input}
          />
          <View style={styles.chips}>
            <Chip label="Everyone" on={!userId} onPress={() => setUserId("")} />
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
          <Text style={styles.muted}>Nothing to report at {site?.name ?? "this site"} for this period. Change the dates or the report.</Text>
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

      <Button icon={<Ionicons name="document-text-outline" size={18} color={colors.primaryForeground} />} disabled={blocked} loading={busy === "pdf"} onPress={() => void makePdf()}>
        PDF
      </Button>
      <View style={{ height: spacing.sm }} />
      <Button variant="outline" icon={<Ionicons name="grid-outline" size={18} color={colors.primary} />} disabled={blocked} loading={busy === "csv"} onPress={() => void makeCsv()}>
        Spreadsheet (opens in Excel)
      </Button>
    </Screen>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

function Stepper({
  label,
  value,
  onChange,
  step = 1,
  monthly = false,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  step?: number;
  monthly?: boolean;
}) {
  const move = (dir: number) => onChange(monthly ? shiftMonth(value, dir) : addDays(value, dir * step));
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.dateRow}>
        <Pressable accessibilityLabel={`${label}: earlier`} onPress={() => move(-1)} style={styles.step}>
          <Ionicons name="chevron-back" size={18} color={colors.foreground} />
        </Pressable>
        <Text style={styles.dateText}>{monthly ? longDate(value).slice(3) : longDate(value)}</Text>
        <Pressable accessibilityLabel={`${label}: later`} onPress={() => move(1)} style={styles.step}>
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
    step: { width: 40, height: 40, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.card, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: typography.body, color: colors.foreground },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
    chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: typography.small, fontWeight: "600", color: colors.mutedForeground },
    chipTextOn: { color: colors.primaryForeground },
    summary: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-around", gap: spacing.sm },
    summaryItem: { alignItems: "center" },
    summaryValue: { fontSize: 20, fontWeight: "800", color: colors.foreground },
  }),
);
