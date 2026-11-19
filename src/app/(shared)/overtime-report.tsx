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
import { getAttendanceTimesheet, listOvertime, type OvertimeRequest, type TimesheetDay } from "@/api/client";
import { useSmartClean } from "@/features/store";
import { useHomePath } from "@/features/roles";
import { useTenantBranding } from "@/services/branding";
import { photoDataUri } from "@/services/reportPhotos";
import { longDate } from "@/domain/managementReport";
import { stampReportFooter } from "@/domain/pdfFooter";
import { buildScheduleReportHtml } from "@/domain/scheduleReportHtml";
import type { AttDay } from "@/domain/attendanceReports";
import { reportCsv } from "@/domain/scheduleReports";
import { OVERTIME_MAX_DAYS, OVERTIME_REPORTS, buildOvertimeReport, type OvertimeReportKind } from "@/domain/overtimeReports";
import { addDays } from "@/domain/scheduleDates";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const MANAGERS = ["org_admin", "operations_manager", "site_manager", "supervisor"];

/**
 * Overtime reports from the phone: overtime and additional hours against the shift, and the request and
 * approval register. Share a PDF laid out like the management report (with charts and analysis), or a spreadsheet.
 */
export default function OvertimeReportScreen() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { state, currentUser } = useSmartClean();
  const homePath = useHomePath();
  const branding = useTenantBranding();
  const sites = state.sites.filter((s) => s.active);
  const today = dayKey(new Date());
  const [kind, setKind] = useState<OvertimeReportKind>("hours");
  const [siteId, setSiteId] = useState(() => sites[0]?.id ?? "");
  const [start, setStart] = useState(addDays(today, -29));
  const [end, setEnd] = useState(today);
  const [requests, setRequests] = useState<OvertimeRequest[]>([]);
  const [days, setDays] = useState<AttDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [nowIso] = useState(() => new Date().toISOString());

  const site = sites.find((s) => s.id === siteId) ?? sites[0];
  const token = state.accessToken;
  const def = OVERTIME_REPORTS.find((r) => r.kind === kind)!;
  const span = (Date.parse(end) - Date.parse(start)) / 864e5;
  const tooLong = span > OVERTIME_MAX_DAYS - 1;
  const badRange = start > end;

  useEffect(() => {
    if (!token || !site || tooLong || badRange) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    // The attendance days give each request its scheduled and worked hours; a request is matched by its day id.
    Promise.all([listOvertime(token, "history", { siteId: site.id, start, end }), getAttendanceTimesheet(token, start, end, site.id)])
      .then(([o, sheet]) => {
        if (cancelled) return;
        setRequests(o);
        setDays(sheet.days as TimesheetDay[] as AttDay[]);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Could not load overtime."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token, site, start, end, tooLong, badRange]);

  const report = useMemo(
    () => (site ? buildOvertimeReport({ kind, siteName: site.name, start, end, nowIso, requests, days }) : null),
    [kind, site, start, end, nowIso, requests, days],
  );

  if (!currentUser || !MANAGERS.includes(currentUser.role)) return <Redirect href={homePath as never} />;

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
      const stamped = await stampReportFooter(printed.base64 ?? "", site.name, report.title, "Overtime");
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
    <Screen title="Overtime reports">
      <Text style={styles.intro}>
        Extra hours past shift end and how each request was decided, for one site. Share a PDF with charts and
        analysis, or a spreadsheet that opens in Excel.
      </Text>

      <Card style={styles.card}>
        <Text style={styles.label}>Report</Text>
        <View style={styles.chips}>
          {OVERTIME_REPORTS.map((r) => (
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
        <Stepper label="From" value={start} onChange={setStart} />
        <Stepper label="To" value={end} onChange={setEnd} />
        {badRange && <Text style={styles.warn}>The end date is before the start date.</Text>}
        {tooLong && <Text style={styles.warn}>Choose a period of {OVERTIME_MAX_DAYS} days or less.</Text>}
      </Card>

      <Card style={styles.card}>
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : error ? (
          <Text style={styles.warn}>{error}</Text>
        ) : empty ? (
          <Text style={styles.muted}>No overtime requests at {site?.name ?? "this site"} for this period. Change the dates.</Text>
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
