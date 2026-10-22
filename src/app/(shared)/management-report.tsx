import { useMemo, useState } from "react";
import { Redirect } from "expo-router";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useSmartClean } from "@/features/store";
import { useCanMakeReports, useHomePath } from "@/features/roles";
import { thumbUrl } from "@/api/client";
import { useTenantBranding } from "@/services/branding";
import {
  buildManagementReport,
  longDate,
  reportFilterOptions,
  suggestedReportName,
} from "@/domain/managementReport";
import { buildManagementReportHtml } from "@/domain/managementReportHtml";
import { stampReportFooter } from "@/domain/pdfFooter";
import { collectReportPhotos, mapWithProgress } from "@/domain/reportPhotos";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";
import { appAlert } from "@/components/Dialog";
import { photoDataUri } from "@/services/reportPhotos";

// Who may produce a client-facing report: managers, supervisors, auditors and
// any staff role whose template allows reports (a cleaner's report covers the
// work they can see, which is their own). See useCanMakeReports.

const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shiftDay = (key: string, by: number) => {
  const [y, m, d] = key.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d + by));
};

/**
 * The client-ready management report, made on the phone: pick a site and a
 * day, narrow it to a kind of work (Opening, Closing) and/or areas, then
 * generate a PDF to share or print. The same report the web app prints.
 */
export default function ManagementReportScreen() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { state, currentUser } = useSmartClean();
  const homePath = useHomePath();
  const canMakeReports = useCanMakeReports();
  const branding = useTenantBranding();
  const sites = state.sites.filter((s) => s.active);
  const [siteId, setSiteId] = useState(() => sites[0]?.id ?? "");
  const [date, setDate] = useState(() => dayKey(new Date()));
  const [pickedTags, setPickedTags] = useState<string[]>([]);
  const [pickedAreas, setPickedAreas] = useState<string[]>([]);
  const [typedName, setTypedName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // What the button says while a report is being made.
  const [stage, setStage] = useState("");

  const site = sites.find((s) => s.id === siteId) ?? sites[0];
  const options = useMemo(
    () => (site ? reportFilterOptions(state.tasks, site.id, date) : { tags: [], areas: [] }),
    [site, date, state.tasks],
  );
  // Only filters that still have work on the chosen day count.
  const tags = pickedTags.filter((t) => options.tags.some((o) => o.toLowerCase() === t.toLowerCase()));
  const areaIds = pickedAreas.filter((id) => options.areas.some((a) => a.id === id));
  const name = typedName ?? suggestedReportName(tags);

  const report = useMemo(
    () =>
      site
        ? buildManagementReport({
            site: { id: site.id, name: site.name, address: site.address },
            date,
            tasks: state.tasks,
            inspections: state.inspections,
            users: state.users.map((u) => ({ id: u.id, name: u.name })),
            tags,
            areaIds,
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [site, date, state.tasks, state.inspections, state.users, tags.join("|"), areaIds.join("|")],
  );

  if (!currentUser || !canMakeReports) {
    return <Redirect href={homePath as never} />;
  }

  const toggle = (list: string[], set: (next: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  async function generate() {
    if (!report || report.sections.length === 0) return;
    setBusy(true);
    try {
      const now = new Date();
      // Fetch small copies of the photos first and embed them in the report, so
      // the PDF step has nothing left to download and we can show real progress.
      const photos = collectReportPhotos(report);
      setStage(photos.length ? `Preparing photos... 0 of ${photos.length}` : "Building the report...");
      const embedded = await mapWithProgress(
        photos,
        4,
        (photo) => photoDataUri(thumbUrl(photo.filePath, 640) ?? photo.uri ?? ""),
        (done, total) => total && setStage(`Preparing photos... ${done} of ${total}`),
      );
      const photoData = new Map(photos.map((p, i) => [p.id, embedded[i]]));
      // The logo is embedded too: the print engine may not fetch it in time.
      const logoData = branding.logoUrl ? await photoDataUri(branding.logoUrl).catch(() => null) : null;
      setStage("Building the report...");
      const html = buildManagementReportHtml({
        report,
        reportName: name,
        clientName: branding.name,
        clientLogoUrl: logoData ?? branding.logoUrl,
        generatedAtLabel: `${longDate(dayKey(now)).toUpperCase()} | ${pad(now.getHours())}:${pad(now.getMinutes())}`,
        reviewerName: currentUser?.name ?? "",
        reviewDateLabel: longDate(dayKey(now)),
        // A photo that could not be fetched falls back to its link, so the print engine can try once more.
        photoSrc: (photo) => photoData.get(photo.id) ?? thumbUrl(photo.filePath, 640) ?? photo.uri ?? null,
      });
      // A4 explicitly: Android's print engine defaults to Letter.
      const printed = await Print.printToFileAsync({ html, base64: true, width: 595, height: 842 });
      // The print engine cannot number pages, so the footer is stamped on after.
      setStage("Adding page numbers...");
      const stamped = await stampReportFooter(printed.base64 ?? "", report.siteName, name.trim() || "Daily Service");
      const uri = `${FileSystem.cacheDirectory}${(name.trim() || "Daily Service").replace(/[^\w-]+/g, "_")}_${dayKey(now)}.pdf`;
      await FileSystem.writeAsStringAsync(uri, stamped, { encoding: FileSystem.EncodingType.Base64 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: `${name.trim() || "Daily Service"} Report`,
          UTI: "com.adobe.pdf",
        });
      } else {
        appAlert("Report ready", "Sharing isn't available on this device.");
      }
    } catch (error) {
      appAlert("Could not create the report", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusy(false);
      setStage("");
    }
  }

  const empty = !report || report.sections.length === 0;

  return (
    <Screen title="Management report">
      <Text style={styles.intro}>
        A client-ready PDF for one site and day: results by area, every checklist with its photos, and the
        sign-off.
      </Text>

      {sites.length > 1 && (
        <Card style={styles.card}>
          <Text style={styles.label}>Site</Text>
          <Chips
            chips={sites.map((s) => ({ id: s.id, label: s.name }))}
            picked={site ? [site.id] : []}
            onToggle={(id) => {
              setSiteId(id);
              setPickedTags([]);
              setPickedAreas([]);
            }}
          />
        </Card>
      )}

      <Card style={styles.card}>
        <Text style={styles.label}>Service date</Text>
        <View style={styles.dateRow}>
          <Pressable accessibilityLabel="Previous day" onPress={() => setDate((d) => shiftDay(d, -1))} style={styles.step}>
            <Ionicons name="chevron-back" size={18} color={colors.foreground} />
          </Pressable>
          <Text style={styles.dateText}>{longDate(date)}</Text>
          <Pressable accessibilityLabel="Next day" onPress={() => setDate((d) => shiftDay(d, 1))} style={styles.step}>
            <Ionicons name="chevron-forward" size={18} color={colors.foreground} />
          </Pressable>
        </View>
        {date !== dayKey(new Date()) && (
          <Pressable onPress={() => setDate(dayKey(new Date()))}>
            <Text style={styles.link}>Back to today</Text>
          </Pressable>
        )}
      </Card>

      {(options.tags.length > 0 || options.areas.length > 1) && (
        <Card style={styles.card}>
          {options.tags.length > 0 && (
            <>
              <Text style={styles.label}>Kind of work {tags.length === 0 ? "(all)" : ""}</Text>
              <Chips
                chips={options.tags.map((t) => ({ id: t, label: t }))}
                picked={tags}
                onToggle={(id) => toggle(tags, setPickedTags, id)}
              />
            </>
          )}
          {options.areas.length > 1 && (
            <>
              <Text style={[styles.label, options.tags.length > 0 && styles.gap]}>
                Area {areaIds.length === 0 ? "(all)" : ""}
              </Text>
              <Chips
                chips={options.areas}
                picked={areaIds}
                onToggle={(id) => toggle(areaIds, setPickedAreas, id)}
              />
            </>
          )}
        </Card>
      )}

      <Card style={styles.card}>
        <Text style={styles.label}>Report name</Text>
        <TextInput
          value={name}
          onChangeText={setTypedName}
          placeholder="e.g. Daily Opening Procedure"
          placeholderTextColor={colors.mutedForeground}
          style={styles.input}
        />
      </Card>

      <Card style={styles.card}>
        {empty ? (
          <Text style={styles.muted}>
            No tasks for {site?.name ?? "this site"} on {longDate(date)}
            {tags.length || areaIds.length ? " with those filters" : ""}. Change the date
            {tags.length || areaIds.length ? " or clear the filters" : ""}.
          </Text>
        ) : (
          <View style={styles.summary}>
            <Summary label="Tasks" value={String(report!.totals.areas)} />
            <Summary label="Checks" value={`${report!.kpis.checksDone}/${report!.kpis.checksTotal}`} />
            <Summary
              label="Mean score"
              value={report!.kpis.meanScore === null ? "-" : `${report!.kpis.meanScore}`}
            />
          </View>
        )}
      </Card>

      <Button
        icon={<Ionicons name="document-text-outline" size={18} color={colors.primaryForeground} />}
        disabled={empty || busy}
        loading={busy}
        onPress={() => void generate()}
      >
        {busy && stage ? stage : "Generate PDF"}
      </Button>
    </Screen>
  );
}

function Chips({
  chips,
  picked,
  onToggle,
}: {
  chips: { id: string; label: string }[];
  picked: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <View style={styles.chips}>
      {chips.map((chip) => {
        const on = picked.includes(chip.id);
        return (
          <Pressable
            key={chip.id}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onToggle(chip.id)}
            style={[styles.chip, on && styles.chipOn]}
          >
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{chip.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  intro: { fontSize: typography.small, color: colors.mutedForeground, marginBottom: spacing.md },
  card: { gap: spacing.sm, marginBottom: spacing.md },
  label: { fontSize: typography.small, fontWeight: "700", color: colors.foreground },
  gap: { marginTop: spacing.sm },
  muted: { fontSize: typography.small, color: colors.mutedForeground },
  link: { fontSize: typography.small, color: colors.primary },
  dateRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
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
}));
