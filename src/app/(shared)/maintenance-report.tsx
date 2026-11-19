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
  getMaintenanceJob,
  listMaintenanceContractors,
  listMaintenanceJobs,
  thumbUrl,
  type MaintenanceJob,
} from "@/api/client";
import { fuzzyFilter } from "@/domain/fuzzySearch";
import { mapWithProgress } from "@/domain/reportPhotos";
import { useMaintenanceOn } from "@/features/maintenance";
import { useSmartClean } from "@/features/store";
import { useHomePath } from "@/features/roles";
import { useTenantBranding } from "@/services/branding";
import { photoDataUri } from "@/services/reportPhotos";
import { longDate } from "@/domain/managementReport";
import { stampReportFooter } from "@/domain/pdfFooter";
import { buildScheduleReportHtml } from "@/domain/scheduleReportHtml";
import { reportCsv } from "@/domain/scheduleReports";
import {
  MAINTENANCE_MAX_DAYS,
  MAINTENANCE_REPORTS,
  buildMaintenanceReport,
  type MaintenanceReportKind,
  type McJob,
} from "@/domain/maintenanceReports";
import { addDays } from "@/domain/scheduleDates";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const MANAGERS = ["org_admin", "operations_manager", "site_manager", "supervisor"];
/** How many contractor jobs are read in full for the cost report. */
const DETAIL_LIMIT = 40;

/**
 * Maintenance reports from the phone: a service report for one work order (laid out like the maintenance
 * template, with its evidence photos), the job register, contractor performance, and cost and payments.
 * Share a PDF with charts and analysis, or a spreadsheet.
 */
export default function MaintenanceReportScreen() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { state, currentUser } = useSmartClean();
  const on = useMaintenanceOn();
  const homePath = useHomePath();
  const branding = useTenantBranding();
  const sites = state.sites.filter((s) => s.active);
  const today = dayKey(new Date());
  const [kind, setKind] = useState<MaintenanceReportKind>("register");
  const [siteId, setSiteId] = useState(() => sites[0]?.id ?? "");
  const [start, setStart] = useState(addDays(today, -29));
  const [end, setEnd] = useState(today);
  const [jobs, setJobs] = useState<McJob[]>([]);
  const [details, setDetails] = useState<McJob[]>([]);
  const [job, setJob] = useState<McJob | null>(null);
  const [jobId, setJobId] = useState("");
  const [query, setQuery] = useState("");
  const [contractors, setContractors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [nowIso] = useState(() => new Date().toISOString());

  const site = sites.find((s) => s.id === siteId) ?? sites[0];
  const token = state.accessToken;
  const def = MAINTENANCE_REPORTS.find((r) => r.kind === kind)!;
  const span = (Date.parse(end) - Date.parse(start)) / 864e5;
  const tooLong = span > MAINTENANCE_MAX_DAYS - 1;
  const badRange = start > end;
  const people = useMemo(() => Object.fromEntries(state.users.map((u) => [u.id, u.name])), [state.users]);
  const locations = useMemo(() => Object.fromEntries(state.locations.map((l) => [l.id, l.name])), [state.locations]);

  useEffect(() => {
    if (!token || !on) return;
    let cancelled = false;
    listMaintenanceContractors(token, true)
      .then((list) => !cancelled && setContractors(Object.fromEntries(list.map((c) => [c.id, c.name]))))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [token, on]);

  useEffect(() => {
    if (!token || !site || !on || tooLong || badRange) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    listMaintenanceJobs(token, "all", { siteId: site.id, start, end })
      .then(async (list) => {
        if (cancelled) return;
        setJobs(list as unknown as McJob[]);
        if (kind !== "cost") return setDetails([]);
        // Invoices and payments are only on a job's own record, so read the costed contractor jobs one by one.
        const costed = list.filter((j) => j.path === "contractor" && j.state !== "reported").slice(0, DETAIL_LIMIT);
        const full: McJob[] = [];
        for (let i = 0; i < costed.length; i += 5) {
          const got = await Promise.all(costed.slice(i, i + 5).map((j) => getMaintenanceJob(token, j.id).catch(() => null)));
          full.push(...(got.filter(Boolean) as unknown as McJob[]));
          if (cancelled) return;
        }
        setDetails(full);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Could not load the jobs."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token, site, on, start, end, tooLong, badRange, kind]);

  useEffect(() => {
    if (kind !== "workorder" || !token || !jobId) return setJob(null);
    let cancelled = false;
    setLoading(true);
    getMaintenanceJob(token, jobId)
      .then((j) => !cancelled && setJob(j as unknown as McJob))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Could not read the job."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token, kind, jobId]);

  const shownJobs = useMemo(
    () => fuzzyFilter([...jobs].sort((a, z) => z.createdAt.localeCompare(a.createdAt)), query, (j) => [j.title, j.assetLabel]).slice(0, 30),
    [jobs, query],
  );

  const build = (photoSrc?: (filePath: string) => string | null) =>
    site
      ? buildMaintenanceReport({
          kind,
          siteName: site.name,
          today,
          nowIso,
          start,
          end,
          jobs,
          job,
          details,
          people,
          locations,
          contractors,
          photoSrc,
        })
      : null;
  const report = useMemo(() => build(), [kind, site, today, nowIso, start, end, jobs, job, details, people, locations, contractors]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!currentUser || !MANAGERS.includes(currentUser.role) || !on) return <Redirect href={homePath as never} />;

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
      // Pictures and the logo are embedded: the print engine may not fetch them in time.
      const paths = (job?.evidence ?? []).slice(0, 12).map((p) => p.filePath);
      const embedded = kind === "workorder" ? await mapWithProgress(paths, 4, (p) => photoDataUri(thumbUrl(p, 960) ?? ""), () => undefined) : [];
      const photoData = new Map(paths.map((p, i) => [p, embedded[i]]));
      const full = kind === "workorder" ? build((p) => photoData.get(p) ?? thumbUrl(p, 960) ?? null) : report;
      const logoData = branding.logoUrl ? await photoDataUri(branding.logoUrl).catch(() => null) : null;
      const html = buildScheduleReportHtml({
        report: full ?? report,
        siteName: site.name,
        siteAddress: site.address ?? "",
        clientName: branding.name,
        clientLogoUrl: logoData ?? branding.logoUrl,
        generatedAtLabel: `${longDate(dayKey(now)).toUpperCase()} | ${pad(now.getHours())}:${pad(now.getMinutes())}`,
        preparedBy: currentUser?.name ?? "",
      });
      // A4 explicitly: Android's print engine defaults to Letter.
      const printed = await Print.printToFileAsync({ html, base64: true, width: 595, height: 842 });
      const stamped = await stampReportFooter(printed.base64 ?? "", site.name, report.title, "Maintenance");
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
    <Screen title="Maintenance reports">
      <Text style={styles.intro}>
        A service report for one job, the job register, contractor performance, and cost and payments for one
        site. Share a PDF with charts and analysis, or a spreadsheet that opens in Excel.
      </Text>

      <Card style={styles.card}>
        <Text style={styles.label}>Report</Text>
        <View style={styles.chips}>
          {MAINTENANCE_REPORTS.map((r) => (
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
        <Stepper label={kind === "workorder" ? "Jobs reported from" : "From"} value={start} onChange={setStart} />
        <Stepper label="To" value={end} onChange={setEnd} />
        {badRange && <Text style={styles.warn}>The end date is before the start date.</Text>}
        {tooLong && <Text style={styles.warn}>Choose a period of a year or less.</Text>}
      </Card>

      {kind === "workorder" && (
        <Card style={styles.card}>
          <Text style={styles.label}>Job</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by fault or asset"
            placeholderTextColor={colors.mutedForeground}
            accessibilityLabel="Search jobs"
            style={styles.input}
          />
          <View style={styles.chips}>
            {shownJobs.map((j) => (
              <Chip key={j.id} label={`${j.title} (${j.createdAt.slice(5, 10)})`} on={jobId === j.id} onPress={() => setJobId(j.id)} />
            ))}
          </View>
          {shownJobs.length === 0 && <Text style={styles.muted}>No job matches</Text>}
        </Card>
      )}

      <Card style={styles.card}>
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : error ? (
          <Text style={styles.warn}>{error}</Text>
        ) : kind === "workorder" && !jobId ? (
          <Text style={styles.muted}>Choose a job to report on.</Text>
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
