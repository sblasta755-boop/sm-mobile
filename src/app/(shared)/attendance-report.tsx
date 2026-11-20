import { useEffect, useMemo, useState } from "react";
import { Redirect } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
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
  listLeaveRequests,
  listSiteBookings,
  type LeaveRequest,
  type StaffBooking,
  type TimesheetDay,
} from "@/api/client";
import { useSmartClean } from "@/features/store";
import { useHomePath } from "@/features/roles";
import { useReportAccessState } from "@/features/reportAccess";
import { useTenantBranding } from "@/services/branding";
import { photoDataUri } from "@/services/reportPhotos";
import { longDate } from "@/domain/managementReport";
import { stampReportFooter } from "@/domain/pdfFooter";
import { buildScheduleReportHtml } from "@/domain/scheduleReportHtml";
import {
  ATTENDANCE_MAX_DAYS,
  ATTENDANCE_REPORTS,
  attendanceCsv,
  attendanceRange,
  buildAttendanceReport,
  type AttDay,
  type AttendanceReportKind,
} from "@/domain/attendanceReports";
import { addDays } from "@/domain/scheduleDates";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const MANAGERS = ["org_admin", "operations_manager", "site_manager", "supervisor"];

/**
 * Attendance reports from the phone: the daily register, summary and clock log, exceptions, and break
 * compliance. Share a PDF laid out like the management report (with charts and analysis), or a spreadsheet.
 */
export default function AttendanceReportScreen() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { state, currentUser } = useSmartClean();
  const homePath = useHomePath();
  const { grants: reportGrants, ready: reportsReady } = useReportAccessState();
  const branding = useTenantBranding();
  const sites = state.sites.filter((s) => s.active);
  const today = dayKey(new Date());
  const [kind, setKind] = useState<AttendanceReportKind>("register");
  const [siteId, setSiteId] = useState(() => sites[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [start, setStart] = useState(addDays(today, -6));
  const [end, setEnd] = useState(today);
  const [days, setDays] = useState<AttDay[]>([]);
  const [bookings, setBookings] = useState<StaffBooking[]>([]);
  const [leave, setLeave] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const site = sites.find((s) => s.id === siteId) ?? sites[0];
  const token = state.accessToken;
  const def = ATTENDANCE_REPORTS.find((r) => r.kind === kind)!;
  const range = attendanceRange(kind, date, start, end);
  const span = (Date.parse(range.end) - Date.parse(range.start)) / 864e5;
  const tooLong = span > ATTENDANCE_MAX_DAYS - 1;
  const badRange = range.start > range.end;
  const needsRoster = kind === "register" || kind === "summary";

  useEffect(() => {
    if (!token || !site || tooLong || badRange) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([
      getAttendanceTimesheet(token, range.start, range.end, site.id),
      // Scheduling or leave may be switched off for this organisation: then there is nothing to compare against.
      needsRoster ? listSiteBookings(token, range.start, range.end, site.id).catch(() => [] as StaffBooking[]) : Promise.resolve([] as StaffBooking[]),
      needsRoster
        ? listLeaveRequests(token, { siteId: site.id, start: range.start, end: range.end }).catch(() => [] as LeaveRequest[])
        : Promise.resolve([] as LeaveRequest[]),
    ])
      .then(([sheet, b, l]) => {
        if (cancelled) return;
        setDays(sheet.days as TimesheetDay[] as AttDay[]);
        setBookings(b);
        setLeave(l);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Could not load attendance."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token, site, range.start, range.end, tooLong, badRange, needsRoster]);

  const report = useMemo(
    () =>
      site
        ? buildAttendanceReport({
            kind,
            siteName: site.name,
            date,
            start,
            end,
            days,
            bookings: bookings.map((b) => ({ userId: b.userId, userName: b.userName, date: b.date, status: b.status })),
            leave: leave.map((l) => ({
              userId: l.userId,
              userName: l.userName,
              startDate: l.startDate,
              endDate: l.endDate,
              status: l.status,
              typeName: l.typeName,
            })),
          })
        : null,
    [kind, site, date, start, end, days, bookings, leave],
  );

  if (!reportsReady) return null;
  if (!currentUser || !(MANAGERS.includes(currentUser.role) || reportGrants.attendance)) return <Redirect href={homePath as never} />;

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
      const stamped = await stampReportFooter(printed.base64 ?? "", site.name, report.title, "Attendance");
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
      await FileSystem.writeAsStringAsync(uri, attendanceCsv(report), { encoding: FileSystem.EncodingType.UTF8 });
      await share(uri, "text/csv", report.title, "public.comma-separated-values-text");
    } catch (e) {
      appAlert("Could not create the file", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy("");
    }
  }

  return (
    <Screen title="Attendance reports">
      <Text style={styles.intro}>
        Who came, who was late, clock events, exceptions and breaks for one site. Share a PDF with charts and
        analysis, or a spreadsheet that opens in Excel.
      </Text>

      <Card style={styles.card}>
        <Text style={styles.label}>Report</Text>
        <View style={styles.chips}>
          {ATTENDANCE_REPORTS.map((r) => (
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
        {def.daily ? (
          <Stepper label="Day" value={date} onChange={(v) => v <= today && setDate(v)} />
        ) : (
          <>
            <Stepper label="From" value={start} onChange={setStart} />
            <Stepper label="To" value={end} onChange={setEnd} />
          </>
        )}
        {badRange && <Text style={styles.warn}>The end date is before the start date.</Text>}
        {tooLong && <Text style={styles.warn}>Choose a period of {ATTENDANCE_MAX_DAYS} days or less.</Text>}
      </Card>

      <Card style={styles.card}>
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : error ? (
          <Text style={styles.warn}>{error}</Text>
        ) : empty ? (
          <Text style={styles.muted}>
            No attendance at {site?.name ?? "this site"} for this period. Change the dates or the report.
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
    <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

function Stepper({ label, value, onChange }: { label: string; value: string; onChange: (next: string) => void }) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.dateRow}>
        <Pressable accessibilityLabel={`${label}: earlier`} onPress={() => onChange(addDays(value, -1))} style={styles.step}>
          <Ionicons name="chevron-back" size={18} color={colors.foreground} />
        </Pressable>
        <Text style={styles.dateText}>{longDate(value)}</Text>
        <Pressable accessibilityLabel={`${label}: later`} onPress={() => onChange(addDays(value, 1))} style={styles.step}>
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
