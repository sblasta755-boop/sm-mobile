import { useCallback, useState } from "react";
import { Redirect, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { StatusBadge } from "@/components/StatusBadge";
import { appAlert } from "@/components/Dialog";
import { deletePayRunDraft, finalisePayRun, getPayRun, logPayRunExport, voidPayRun, type PayRun } from "@/api/client";
import {
  buildInvoicesHtml,
  buildSummaryHtml,
  dayDetailCsv,
  formatDays,
  formatHours,
  formatMoney,
  periodLabel,
  summaryCsv,
} from "@/domain/payroll";
import { useCanUsePayroll } from "@/features/payroll";
import { useHomePath } from "@/features/roles";
import { useSmartClean } from "@/features/store";
import { useTenantBranding } from "@/services/branding";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";
import { PAY_STATUS } from "../pay-runs";

const safe = (text: string) => text.replace(/[^\w-]+/g, "_") || "pay_run";

/** One run: its figures, the actions that fit its status, and the documents to share. */
export default function PayRunDetailScreen() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { runId } = useLocalSearchParams<{ runId: string }>();
  const { state } = useSmartClean();
  const token = state.accessToken;
  const allowed = useCanUsePayroll();
  const homePath = useHomePath();
  const branding = useTenantBranding();
  const [run, setRun] = useState<PayRun | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  // Who the invoices are for: everyone, one person, or a chosen few.
  const [picked, setPicked] = useState<string[] | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    if (!token || !runId) return;
    try {
      setRun(await getPayRun(token, runId));
    } catch (error) {
      appAlert("Could not open the pay run", error instanceof Error ? error.message : "Please try again.");
    }
  }, [token, runId]);
  useFocusEffect(
    useCallback(() => {
      if (allowed) void load();
    }, [allowed, load]),
  );

  if (!allowed) return <Redirect href={homePath as never} />;
  if (!run) {
    return (
      <Screen title="Pay run">
        <ActivityIndicator color={colors.primary} />
      </Screen>
    );
  }

  const status = PAY_STATUS[run.status];
  const people = run.people ?? [];
  const chosen = picked ?? people.map((p) => p.userId);
  const note = (document: string, who?: string) => {
    if (token) void logPayRunExport(token, run.id, document, who).catch(() => undefined);
  };
  const docOptions = () => ({
    brandName: branding.name,
    logoUrl: branding.logoUrl,
    generatedLabel: new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" }).toUpperCase(),
  });
  const share = async (uri: string, mimeType: string, title: string, uti?: string) => {
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType, dialogTitle: title, UTI: uti });
    else appAlert("Ready", "Sharing isn't available on this device.");
  };
  const sharePdf = async (html: string, name: string) => {
    // A4 explicitly: Android's print engine defaults to Letter.
    const printed = await Print.printToFileAsync({ html, width: 595, height: 842 });
    const uri = `${FileSystem.cacheDirectory}${safe(name)}.pdf`;
    await FileSystem.copyAsync({ from: printed.uri, to: uri });
    await share(uri, "application/pdf", name, "com.adobe.pdf");
  };
  const shareCsv = async (csv: string, name: string) => {
    const uri = `${FileSystem.cacheDirectory}${safe(name)}.csv`;
    await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
    await share(uri, "text/csv", name, "public.comma-separated-values-text");
  };
  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (error) {
      appAlert("Something went wrong", error instanceof Error ? error.message : "Please try again.");
    }
  };

  return (
    <Screen title={run.title}>
      <View style={styles.row}>
        <StatusBadge tone={status.tone} label={status.label} />
        <Text style={styles.muted}>{periodLabel(run)}</Text>
      </View>
      <Text style={styles.muted}>
        {run.siteNames.join(", ") || "All sites"} · {run.ruleName} · by {run.createdByName}
        {run.finalisedByName ? ` · finalised by ${run.finalisedByName}` : ""}
      </Text>
      <Text style={styles.muted}>{run.ruleDescription}</Text>
      {run.status === "void" && <Text style={styles.error}>Voided: {run.voidReason}</Text>}

      <View style={styles.kpis}>
        {[
          ["People", String(run.totals.people)],
          ["Days", formatDays(run.totals.daysCounted)],
          ["Hours", formatHours(run.totals.paidHours)],
          ["Gross pay", formatMoney(run.totals.gross, run.currency)],
        ].map(([k, v]) => (
          <Card key={k} style={styles.kpi}>
            <Text style={styles.muted}>{k}</Text>
            <Text style={styles.kpiValue}>{v}</Text>
          </Card>
        ))}
      </View>

      {run.status === "draft" && (
        <View style={styles.actions}>
          <Button variant="outline" onPress={() => router.push(`/pay-run-new?draft=${run.id}` as never)}>
            Edit
          </Button>
          <Button
            onPress={() =>
              appAlert("Finalise this run?", "The figures are frozen as they stand now.", [
                { text: "Cancel", style: "cancel" },
                { text: "Finalise", onPress: () => void act(async () => { if (token) { await finalisePayRun(token, run.id); await load(); } }) },
              ])
            }
          >
            Finalise
          </Button>
          <Button
            variant="destructive"
            onPress={() =>
              appAlert("Delete this draft?", undefined, [
                { text: "Cancel", style: "cancel" },
                { text: "Delete", style: "destructive", onPress: () => void act(async () => { if (token) { await deletePayRunDraft(token, run.id); router.replace("/pay-runs" as never); } }) },
              ])
            }
          >
            Delete draft
          </Button>
        </View>
      )}
      {run.status === "final" && (
        <Button variant="destructive" onPress={() => setVoiding(true)}>
          Void this run
        </Button>
      )}

      <Card style={styles.card}>
        <Text style={styles.heading}>Share</Text>
        <Button variant="outline" onPress={() => act(async () => { await sharePdf(buildSummaryHtml(run, docOptions()), `${run.title}_summary`); note("summary-pdf"); })}>
          Summary PDF
        </Button>
        <View style={styles.row}>
          <Text style={styles.muted}>
            Invoices for {chosen.length} of {people.length}
          </Text>
          <View style={styles.links}>
            <Pressable onPress={() => setPicked(people.map((p) => p.userId))}>
              <Text style={styles.link}>Everyone</Text>
            </Pressable>
            <Pressable onPress={() => setPicked([])}>
              <Text style={styles.link}>No one</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.chips}>
          {people.map((p) => {
            const on = chosen.includes(p.userId);
            return (
              <Pressable
                key={p.userId}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                onPress={() => setPicked(on ? chosen.filter((id) => id !== p.userId) : [...chosen, p.userId])}
                onLongPress={() => setPicked([p.userId])}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{p.name}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.muted}>Tap a name to tick or untick it; press and hold to choose only that person.</Text>
        <Button
          variant="outline"
          disabled={chosen.length === 0}
          onPress={() =>
            act(async () => {
              const who = people.filter((p) => chosen.includes(p.userId));
              await sharePdf(
                buildInvoicesHtml(run, who, docOptions()),
                `${run.title}_${who.length === 1 ? who[0].name : "invoices"}`,
              );
              note("invoice-pdf", who.map((p) => p.userId).join(","));
            })
          }
        >
          Invoice PDF for the {chosen.length === 1 ? "person" : "people"} ticked
        </Button>
        <Button variant="outline" onPress={() => act(async () => { await shareCsv(summaryCsv(run), `${run.title}_summary`); note("csv"); })}>
          Spreadsheet (opens in Excel)
        </Button>
        <Button variant="outline" onPress={() => act(async () => { await shareCsv(dayDetailCsv(run), `${run.title}_day_detail`); note("csv-days"); })}>
          Day-by-day spreadsheet
        </Button>
        {run.status !== "final" && <Text style={styles.muted}>Documents from a draft are marked as a draft.</Text>}
      </Card>

      {people.map((p) => {
        const expanded = open === p.userId;
        return (
          <Card key={p.userId} style={styles.person}>
            <Pressable style={styles.row} onPress={() => setOpen(expanded ? null : p.userId)} accessibilityRole="button">
              <View style={styles.flex}>
                <Text style={styles.name}>{p.name}</Text>
                <Text style={styles.muted}>
                  {formatDays(p.daysCounted)} days · {formatHours(p.paidHours)} at {formatMoney(p.rate, run.currency)}
                </Text>
              </View>
              <Text style={styles.gross}>{formatMoney(p.gross, run.currency)}</Text>
              <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
            </Pressable>
            {expanded && (
              <View style={styles.days}>
                {p.adjustments.map((a, i) => (
                  <View key={i} style={styles.row}>
                    <Text style={styles.muted}>{a.label}</Text>
                    <Text style={styles.muted}>{formatMoney(a.amount, run.currency)}</Text>
                  </View>
                ))}
                {p.days.map((d) => (
                  <View key={d.dayId} style={styles.row}>
                    <Text style={styles.muted}>{d.date ?? d.label ?? "Entered by hand"}</Text>
                    <Text style={d.counted ? styles.muted : styles.error}>{d.counted ? formatHours(d.paidHours) : d.reason}</Text>
                  </View>
                ))}
              </View>
            )}
          </Card>
        );
      })}

      <Modal visible={voiding} transparent animationType="fade" onRequestClose={() => setVoiding(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.heading}>Why is this run being voided?</Text>
            <TextInput style={styles.input} value={reason} onChangeText={setReason} placeholder="e.g. Wrong rate" placeholderTextColor={colors.mutedForeground} multiline />
            <Button variant="outline" onPress={() => setVoiding(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={reason.trim().length < 3}
              onPress={() =>
                act(async () => {
                  if (!token) return;
                  await voidPayRun(token, run.id, reason.trim());
                  setVoiding(false);
                  setReason("");
                  await load();
                })
              }
            >
              Void run
            </Button>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
    flex: { flex: 1, minWidth: 0 },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    error: { fontSize: typography.small, color: colors.destructive },
    heading: { fontSize: typography.body, fontWeight: "800", color: colors.foreground },
    kpis: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginVertical: spacing.md },
    kpi: { width: "48%", gap: 2 },
    kpiValue: { fontSize: 18, fontWeight: "800", color: colors.foreground },
    actions: { gap: spacing.sm },
    links: { flexDirection: "row", gap: spacing.md },
    link: { fontSize: typography.small, fontWeight: "700", color: colors.primary },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: typography.small, fontWeight: "600", color: colors.mutedForeground },
    chipTextOn: { color: colors.white },
    card: { marginVertical: spacing.md, gap: spacing.sm },
    person: { marginBottom: spacing.sm, gap: spacing.sm },
    name: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    gross: { fontSize: typography.body, fontWeight: "800", color: colors.foreground },
    days: { gap: 4, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: spacing.lg },
    sheet: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
    input: { minHeight: 72, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, color: colors.foreground, textAlignVertical: "top" },
  }),
);
