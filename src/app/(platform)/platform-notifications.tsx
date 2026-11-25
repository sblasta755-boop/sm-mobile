import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { appAlert } from "@/components/Dialog";
import { BarRows } from "@/components/PlatformHomeKit";
import { useSmartClean } from "@/features/store";
import {
  getPlatformNotificationHeatmap,
  getPlatformNotificationOverview,
  getPlatformNotificationPerson,
  listPlatformNotificationLog,
  listPlatformNotificationPeople,
  listPlatformNotificationRoles,
  listPlatformNotificationTemplates,
  listPlatformOrganisations,
  savePlatformNotificationGuard,
  type NotificationGuardSettings,
  type NotificationInsight,
  type NotificationLogItem,
  type NotificationOverview,
  type NotificationPerson,
  type NotificationPersonDetail,
  type NotificationRole,
  type NotificationTemplate,
} from "@/api/client";
import { buildNotificationReportHtml, notificationReportName } from "@/domain/notificationReportHtml";
import { stampReportFooter } from "@/domain/pdfFooter";
import {
  LOG_CHANNELS,
  LOG_STATUSES,
  RANGE_OPTIONS,
  WEEKDAYS,
  bucketLabel,
  categoryLabel,
  changeLabel,
  channelLabel,
  guardChanged,
  guardErrors,
  heatLevel,
  logTime,
  matchOrganisations,
  pct,
  roleLabel,
  statusLabel,
} from "@/domain/notificationInsights";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

type Section = "overview" | "people" | "roles" | "common" | "log";
type Sort = "total" | "peak" | "unread" | "daily";
const SECTIONS: { value: Section; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "people", label: "People" },
  { value: "roles", label: "Roles" },
  { value: "common", label: "Most common" },
  { value: "log", label: "Log" },
];
const SORTS: { value: Sort; label: string }[] = [
  { value: "total", label: "Most received" },
  { value: "peak", label: "Highest per hour" },
  { value: "daily", label: "Busiest days" },
  { value: "unread", label: "Most unread" },
];

function Chip({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <TextInput style={styles.input} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.mutedForeground} accessibilityLabel={placeholder} autoCapitalize="none" />
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
      {hint ? <Text style={styles.muted}>{hint}</Text> : null}
    </View>
  );
}

function Insight({ insight }: { insight: NotificationInsight }) {
  const tone = insight.severity === "critical" ? colors.destructive : insight.severity === "warning" ? colors.warning : colors.border;
  return (
    <View style={[styles.card, { borderColor: tone }]}>
      <Text style={styles.cardTitle}>{insight.title}</Text>
      <Text style={styles.muted}>{insight.detail}</Text>
      <Text style={styles.body}>
        <Text style={styles.bold}>What to do: </Text>
        {insight.recommendation}
      </Text>
    </View>
  );
}

/**
 * How much the system notifies people, on the phone: volume and rate, who gets the most (people and roles), the
 * most common messages, delivery results, written findings and the guard that limits it. The same figures as the
 * web console's Notifications tab. Platform operators only.
 */
export default function PlatformNotificationsScreen() {
  useThemeVersion();
  const { state } = useSmartClean();
  const token = state.accessToken;
  const [section, setSection] = useState<Section>("overview");
  const [days, setDays] = useState<number>(7);
  const [tenantId, setTenantId] = useState("");
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);
  const [orgOpen, setOrgOpen] = useState(false);
  const [orgQuery, setOrgQuery] = useState("");
  const query = useMemo(() => ({ days, tenantId: tenantId || undefined }), [days, tenantId]);

  async function exportPdf() {
    if (!token) return;
    try {
      const [overview, people, roles, templates] = await Promise.all([
        getPlatformNotificationOverview(token, query),
        listPlatformNotificationPeople(token, { ...query, sort: "total", offset: 0 }),
        listPlatformNotificationRoles(token, query),
        listPlatformNotificationTemplates(token, query),
      ]);
      const now = new Date();
      const scope = orgs.find((o) => o.id === tenantId)?.name ?? "All organisations";
      const html = buildNotificationReportHtml({
        overview,
        people: people.people,
        roles: roles.roles,
        templates: templates.templates.slice(0, 25),
        scope,
        generatedAt: now,
      });
      // A4 explicitly: Android's print engine defaults to Letter.
      const printed = await Print.printToFileAsync({ html, base64: true, width: 595, height: 842 });
      const stamped = await stampReportFooter(printed.base64 ?? "", scope, `Last ${days} days`, "Notification report");
      const name = notificationReportName(scope, days, now);
      const uri = `${FileSystem.cacheDirectory}${name}.pdf`;
      await FileSystem.writeAsStringAsync(uri, stamped, { encoding: FileSystem.EncodingType.Base64 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Notification report", UTI: "com.adobe.pdf" });
      } else {
        appAlert("Report ready", "Sharing isn't available on this device.");
      }
    } catch (e) {
      appAlert("Could not create the report", e instanceof Error ? e.message : "Please try again.");
    }
  }

  useEffect(() => {
    if (!token) return;
    listPlatformOrganisations(token, 1, 100)
      .then((r) => setOrgs(r.items.map((o) => ({ id: o.id, name: o.name }))))
      .catch(() => setOrgs([]));
  }, [token]);

  return (
    <Screen title="Notifications">
      <View style={styles.row}>
        {SECTIONS.map((s) => <Chip key={s.value} on={section === s.value} label={s.label} onPress={() => setSection(s.value)} />)}
      </View>
      <View style={styles.row}>
        {RANGE_OPTIONS.map((d) => <Chip key={d} on={days === d} label={`${d} days`} onPress={() => setDays(d)} />)}
        <Chip on={orgOpen || !!tenantId} label={orgs.find((o) => o.id === tenantId)?.name ?? "All organisations"} onPress={() => setOrgOpen((o) => !o)} />
      </View>
      <Button variant="outline" onPress={exportPdf} icon={<Ionicons name="document-text-outline" size={18} color={colors.foreground} />}>
        PDF report
      </Button>
      {orgOpen && (
        <View style={styles.card}>
          <SearchBox value={orgQuery} onChange={setOrgQuery} placeholder="Find an organisation" />
          <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            <Pressable style={styles.listRow} onPress={() => { setTenantId(""); setOrgOpen(false); }} accessibilityRole="button">
              <Text style={styles.body}>All organisations</Text>
            </Pressable>
            {matchOrganisations(orgs, orgQuery).map((o) => (
              <Pressable key={o.id} style={styles.listRow} onPress={() => { setTenantId(o.id); setOrgOpen(false); }} accessibilityRole="button">
                <Text style={[styles.body, o.id === tenantId && styles.bold]}>{o.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {section === "overview" && <OverviewSection token={token} query={query} />}
      {section === "people" && <PeopleSection token={token} query={query} />}
      {section === "roles" && <RolesSection token={token} query={query} />}
      {section === "common" && <CommonSection token={token} query={query} />}
      {section === "log" && <LogSection token={token} query={query} />}
    </Screen>
  );
}

type SectionProps = { token: string | null; query: { days: number; tenantId?: string } };

function useLoaded<T>(load: () => Promise<T | null>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    setLoading(true);
    load()
      .then((r) => live && setData(r))
      .catch((e) => live && appAlert("Could not load", e instanceof Error ? e.message : "Please try again."))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, loading };
}

function OverviewSection({ token, query }: SectionProps) {
  const { data, loading } = useLoaded<NotificationOverview>(() => (token ? getPlatformNotificationOverview(token, query) : Promise.resolve(null)), [token, query]);
  const heat = useLoaded(() => (token ? getPlatformNotificationHeatmap(token, { ...query, days: Math.max(query.days, 30) }) : Promise.resolve(null)), [token, query]);
  const [guardOverride, setGuardOverride] = useState<NotificationGuardSettings | null>(null);
  if (loading && !data) return <ActivityIndicator color={colors.primary} />;
  if (!data) return <Text style={styles.muted}>No figures yet.</Text>;
  const guard = guardOverride ?? data.guard;
  const peak = Math.max(1, ...data.series.map((p) => p.count));
  const heatMax = Math.max(0, ...(heat.data?.grid.flat() ?? [0]));
  const heatTone = ["transparent", colors.muted, colors.border, colors.primary, colors.primary];
  return (
    <View style={styles.stack}>
      <View style={styles.kpis}>
        <Kpi label="Notifications" value={data.totals.total.toLocaleString()} hint={`${changeLabel(data.totals.change, data.totals.total)} vs the period before`} />
        <Kpi label="Per hour" value={String(data.totals.perHour)} />
        <Kpi label="People reached" value={String(data.totals.recipients)} hint={`${data.totals.broadcast} sent to everyone`} />
        <Kpi label="Opened" value={pct(data.totals.readRate)} />
        <Kpi label="Held by the guard" value={String(data.suppressed.duplicate + data.suppressed.burst)} hint={`${data.suppressed.duplicate} duplicates, ${data.suppressed.burst} bursts`} />
      </View>

      <Text style={styles.h2}>What to look at</Text>
      {data.insights.length === 0 ? <Text style={styles.muted}>Nothing stands out. Volume looks healthy for this period.</Text> : data.insights.map((i) => <Insight key={i.id} insight={i} />)}

      <Text style={styles.h2}>Volume over time</Text>
      <View style={styles.card}>
        <View style={styles.bars} accessibilityLabel="Notifications over time">
          {data.series.map((p) => <View key={p.t} style={[styles.barCol, { height: `${Math.max(3, (p.count / peak) * 100)}%` }]} />)}
        </View>
        {data.series.length > 0 && (
          <View style={styles.axis}>
            <Text style={styles.muted}>{bucketLabel(data.series[0].t, data.bucket)}</Text>
            <Text style={styles.muted}>{bucketLabel(data.series[data.series.length - 1].t, data.bucket)}</Text>
          </View>
        )}
      </View>

      <Text style={styles.h2}>By kind of notification</Text>
      <View style={styles.card}>
        <BarRows rows={data.byCategory.map((c) => ({ label: `${categoryLabel(c.category)} · ${pct(c.share)} · ${pct(c.readRate)} opened`, value: c.count }))} />
      </View>
      <Text style={styles.h2}>By organisation</Text>
      <View style={styles.card}>
        <BarRows rows={data.byOrganisation.map((c) => ({ label: `${c.name} · ${pct(c.share)}`, value: c.count }))} />
      </View>
      <Text style={styles.h2}>How many people each event tells</Text>
      <View style={styles.card}>
        <BarRows rows={data.fanOut.map((c) => ({ label: `${categoryLabel(c.category)} · ${c.avgRecipients.toFixed(1)} people × ${c.events}`, value: c.avgRecipients, tone: c.avgRecipients >= 5 ? "warn" : "primary" }))} />
        {data.repeats.groups > 0 && <Text style={styles.muted}>{data.repeats.groups} events were notified to the same person more than twice ({data.repeats.notifications} notifications).</Text>}
      </View>

      <Text style={styles.h2}>Delivery results</Text>
      <View style={styles.kpis}>
        {(["push", "web_push", "email"] as const).map((ch) => {
          const c = data.channels[ch];
          const attempts = c.sent + c.failed;
          return <Kpi key={ch} label={ch === "push" ? "Phone push" : ch === "web_push" ? "Browser push" : "Email"} value={String(c.sent)} hint={`${c.failed} failed${attempts ? ` (${pct(c.failed / attempts)})` : ""} · ${c.suppressed} held`} />;
        })}
      </View>
      <Text style={styles.muted}>
        {data.deliveryLogSince ? `Recorded from ${new Date(data.deliveryLogSince).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}; earlier history was not kept.` : "Delivery results will appear as notifications are sent."}
      </Text>

      {data.bursts.length > 0 && (
        <>
          <Text style={styles.h2}>Bursts: more than {data.burstThreshold} in one hour</Text>
          <View style={styles.card}>
            {data.bursts.slice(0, 10).map((b) => (
              <View key={`${b.userId}${b.hourStart}`} style={styles.listRow}>
                <Text style={[styles.body, { flex: 1 }]}>{b.name} ({roleLabel(b.role)})</Text>
                <Text style={styles.body}>{b.count} at {bucketLabel(b.hourStart, "hour")}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      <Text style={styles.h2}>When it peaks</Text>
      <View style={styles.card}>
        {heat.data ? (
          heat.data.grid.map((row, d) => (
            <View key={WEEKDAYS[d]} style={styles.heatRow}>
              <Text style={styles.heatDay}>{WEEKDAYS[d]}</Text>
              {row.map((count, h) => <View key={h} style={[styles.heatCell, { backgroundColor: heatTone[heatLevel(count, heatMax)], opacity: heatLevel(count, heatMax) === 3 ? 0.7 : 1 }]} />)}
            </View>
          ))
        ) : <ActivityIndicator color={colors.primary} />}
        <Text style={styles.muted}>Hours 00 to 23, left to right.</Text>
      </View>

      <GuardCard guard={guard} onSaved={setGuardOverride} token={token} />
    </View>
  );
}

function GuardCard({ guard, onSaved, token }: { guard: NotificationGuardSettings; onSaved: (g: NotificationGuardSettings) => void; token: string | null }) {
  const [form, setForm] = useState({ enabled: guard.enabled, dedupeWindowMinutes: String(guard.dedupeWindowMinutes), pushPerRecipientPerHour: String(guard.pushPerRecipientPerHour) });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setForm({ enabled: guard.enabled, dedupeWindowMinutes: String(guard.dedupeWindowMinutes), pushPerRecipientPerHour: String(guard.pushPerRecipientPerHour) });
  }, [guard]);
  const errors = guardErrors(form, guard.bounds);
  const dirty = guardChanged(form, guard);
  const save = async () => {
    if (!token || Object.keys(errors).length > 0) return;
    setBusy(true);
    try {
      onSaved(await savePlatformNotificationGuard(token, { enabled: form.enabled, dedupeWindowMinutes: Number(form.dedupeWindowMinutes), pushPerRecipientPerHour: Number(form.pushPerRecipientPerHour) }));
      appAlert("Saved", "Guard settings saved.");
    } catch (e) {
      appAlert("Could not save", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const confirmSave = () => {
    if (!form.enabled && guard.enabled) {
      appAlert("Switch the guard off?", "Duplicate notifications and bursts of push alerts will no longer be held back for anyone.", [
        { text: "Keep it on", style: "cancel" },
        { text: "Switch off", style: "destructive", onPress: () => void save() },
      ]);
      return;
    }
    void save();
  };
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
        <Text style={styles.cardTitle}>Notification guard</Text>
      </View>
      <Text style={styles.muted}>Applies to every organisation. Drops an identical notification to the same person inside a short window, and holds back push alerts beyond an hourly limit (the notification still shows in the app). Critical alerts are never held back.</Text>
      <View style={styles.row}>
        <Switch value={form.enabled} onValueChange={(enabled) => setForm((f) => ({ ...f, enabled }))} accessibilityLabel="Guard on" />
        <Text style={styles.body}>Guard {form.enabled ? "on" : "off"}</Text>
      </View>
      {(["dedupeWindowMinutes", "pushPerRecipientPerHour"] as const).map((key) => (
        <View key={key} style={{ gap: 4 }}>
          <Text style={styles.body}>{guard.bounds.find((b) => b.key === key)?.label}</Text>
          <TextInput style={styles.input} value={form[key]} onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))} keyboardType="number-pad" accessibilityLabel={key} />
          {errors[key] ? <Text style={styles.error}>{errors[key]}</Text> : null}
        </View>
      ))}
      <Button loading={busy} disabled={!dirty || Object.keys(errors).length > 0} onPress={confirmSave}>Save guard settings</Button>
    </View>
  );
}

function PeopleSection({ token, query }: SectionProps) {
  const [sort, setSort] = useState<Sort>("total");
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => { setDebounced(q); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [q]);
  const { data, loading } = useLoaded(() => (token ? listPlatformNotificationPeople(token, { ...query, sort, q: debounced, offset: page * 25 }) : Promise.resolve(null)), [token, query, sort, debounced, page]);
  return (
    <View style={styles.stack}>
      <SearchBox value={q} onChange={setQ} placeholder="Find a person, role or organisation" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {SORTS.map((s) => <Chip key={s.value} on={sort === s.value} label={s.label} onPress={() => { setSort(s.value); setPage(0); }} />)}
      </ScrollView>
      {loading && !data ? <ActivityIndicator color={colors.primary} /> : (
        <>
          {(data?.people ?? []).map((p: NotificationPerson) => (
            <Pressable key={p.userId} style={styles.card} onPress={() => setDetail(p.userId)} accessibilityRole="button" accessibilityLabel={`${p.name}, ${p.total} notifications`}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{p.name}</Text>
                  <Text style={styles.muted}>{roleLabel(p.role)} · {p.organisation}{p.pushOff ? " · push off" : ""}</Text>
                </View>
                <Text style={styles.big}>{p.total}</Text>
              </View>
              <Text style={styles.muted}>{p.perDay} a day · busiest hour {p.peakPerHour} · {pct(p.unreadRate)} unread{p.topCategory ? ` · mostly ${categoryLabel(p.topCategory)}` : ""}</Text>
            </Pressable>
          ))}
          {(data?.people.length ?? 0) === 0 && <Text style={styles.muted}>No one found.</Text>}
          <View style={styles.row}>
            <Text style={[styles.muted, { flex: 1 }]}>{data ? `${data.count} people` : ""}</Text>
            <Button variant="outline" disabled={page === 0} onPress={() => setPage((n) => n - 1)}>Previous</Button>
            <Button variant="outline" disabled={!data || (page + 1) * 25 >= data.count} onPress={() => setPage((n) => n + 1)}>Next</Button>
          </View>
        </>
      )}
      <PersonSheet token={token} userId={detail} days={query.days} onClose={() => setDetail(null)} />
    </View>
  );
}

function PersonSheet({ token, userId, days, onClose }: { token: string | null; userId: string | null; days: number; onClose: () => void }) {
  const [data, setData] = useState<NotificationPersonDetail | null>(null);
  useEffect(() => {
    setData(null);
    if (!token || !userId) return;
    let live = true;
    getPlatformNotificationPerson(token, userId, days)
      .then((d) => live && setData(d))
      .catch((e) => appAlert("Could not load", e instanceof Error ? e.message : "Please try again."));
    return () => { live = false; };
  }, [token, userId, days]);
  if (!userId) return null;
  const max = Math.max(1, ...(data?.byHourOfDay ?? [0]));
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.sheetBody}>
            {data ? (
              <>
                <Text style={styles.h2}>{data.name}</Text>
                <Text style={styles.muted}>{roleLabel(data.role)} at {data.organisation}. {data.total} notifications in {data.days} days ({data.perDay} a day).</Text>
                <BarRows rows={data.byCategory.map((c) => ({ label: `${categoryLabel(c.category)} · ${pct(c.readRate)} opened`, value: c.count }))} />
                <Text style={styles.kpiLabel}>By hour of day</Text>
                <View style={styles.bars}>
                  {data.byHourOfDay.map((c, h) => <View key={h} style={[styles.barCol, { height: `${Math.max(4, (c / max) * 100)}%` }]} />)}
                </View>
                <Text style={styles.kpiLabel}>Latest</Text>
                {data.recent.map((r) => (
                  <View key={r.id} style={styles.listRow}>
                    <Text style={[styles.body, { flex: 1 }]} numberOfLines={1}>{r.title}</Text>
                    <Text style={styles.muted}>{r.read ? "read" : "unread"}</Text>
                  </View>
                ))}
              </>
            ) : <ActivityIndicator color={colors.primary} />}
            <Button variant="ghost" onPress={onClose}>Close</Button>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function RolesSection({ token, query }: SectionProps) {
  const { data, loading } = useLoaded(() => (token ? listPlatformNotificationRoles(token, query) : Promise.resolve(null)), [token, query]);
  if (loading && !data) return <ActivityIndicator color={colors.primary} />;
  const roles: NotificationRole[] = data?.roles ?? [];
  return (
    <View style={styles.stack}>
      <Text style={styles.h2}>Per person per day, by role</Text>
      <View style={styles.card}>
        <BarRows rows={roles.map((r) => ({ label: `${roleLabel(r.role)} · ${r.perPersonPerDay} a day · ${r.people} people`, value: r.perPersonPerDay }))} />
      </View>
      {roles.map((r) => (
        <View key={r.role} style={styles.card}>
          <View style={styles.row}>
            <Text style={[styles.cardTitle, { flex: 1 }]}>{roleLabel(r.role)}</Text>
            <Text style={styles.big}>{r.total}</Text>
          </View>
          <Text style={styles.muted}>{r.people} people · {pct(r.share)} of all · typical person (95th) {r.p95PerPerson} · most any one person {r.maxPerPerson} · busiest hour {r.peakPerHour} · {pct(r.unreadRate)} unread</Text>
        </View>
      ))}
      {roles.length === 0 && <Text style={styles.muted}>No notifications in this period.</Text>}
    </View>
  );
}

function CommonSection({ token, query }: SectionProps) {
  const [q, setQ] = useState("");
  const { data, loading } = useLoaded(() => (token ? listPlatformNotificationTemplates(token, query) : Promise.resolve(null)), [token, query]);
  const rows: NotificationTemplate[] = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.templates ?? []).filter((t) => !needle || t.title.toLowerCase().includes(needle) || t.category.includes(needle));
  }, [data, q]);
  if (loading && !data) return <ActivityIndicator color={colors.primary} />;
  return (
    <View style={styles.stack}>
      <SearchBox value={q} onChange={setQ} placeholder="Find a message" />
      <Text style={styles.muted}>{'Numbers and names in quotes count as the same, so "Table 4 bill" and "Table 12 bill" are one message.'}</Text>
      {rows.map((t) => (
        <View key={`${t.category}|${t.title}`} style={styles.card}>
          <View style={styles.row}>
            <Text style={[styles.cardTitle, { flex: 1 }]}>{t.title}</Text>
            <Text style={styles.big}>{t.count}</Text>
          </View>
          <Text style={styles.muted}>{categoryLabel(t.category)} · {t.recipients} people · {t.organisations} {t.organisations === 1 ? "organisation" : "organisations"} · {pct(t.readRate)} opened</Text>
          <Text style={[styles.muted, (t.change ?? 0) > 0 && { color: colors.warning }]}>{changeLabel(t.change, t.count)} vs before · {pct(t.share)} of all</Text>
          {t.message ? <Text style={styles.muted} numberOfLines={2}>e.g. {t.message}</Text> : null}
        </View>
      ))}
      {rows.length === 0 && <Text style={styles.muted}>No messages found.</Text>}
    </View>
  );
}

/** The raw record: every notification and every push, browser push or email attempt, newest first. */
function LogSection({ token, query }: SectionProps) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [channel, setChannel] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => { setDebounced(q); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [q]);
  const { data, loading } = useLoaded(
    () => (token ? listPlatformNotificationLog(token, { ...query, q: debounced, channel, status, offset: page * 50 }) : Promise.resolve(null)),
    [token, query, debounced, channel, status, page],
  );
  return (
    <View style={styles.stack}>
      <SearchBox value={q} onChange={setQ} placeholder="Find by message, person or reason" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {LOG_CHANNELS.map((c) => <Chip key={c.value} on={channel === c.value} label={c.label} onPress={() => { setChannel(c.value); setPage(0); }} />)}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {LOG_STATUSES.map((c) => <Chip key={c.value} on={status === c.value} label={c.label} onPress={() => { setStatus(c.value); setPage(0); }} />)}
      </ScrollView>
      {loading && !data ? <ActivityIndicator color={colors.primary} /> : (
        <>
          {(data?.items ?? []).map((r: NotificationLogItem) => (
            <Pressable key={r.id} style={styles.card} onPress={() => setOpen(open === r.id ? null : r.id)} accessibilityRole="button" accessibilityLabel={`${r.title || "Notification"}, ${statusLabel(r.status, r.reason)}`}>
              <View style={styles.row}>
                <Text style={[styles.muted, { flex: 1 }]}>{logTime(r.createdAt)}</Text>
                <Text style={[styles.muted, r.status === "failed" && { color: colors.destructive }, r.status === "suppressed" && { color: colors.warning }]}>{channelLabel(r.channel)} · {statusLabel(r.status, r.reason)}</Text>
              </View>
              <Text style={styles.cardTitle} numberOfLines={open === r.id ? undefined : 2}>{r.title || "(no message recorded)"}</Text>
              <Text style={styles.muted}>{[r.recipient || "-", r.role ? roleLabel(r.role) : "", r.organisation].filter(Boolean).join(" · ")}</Text>
              {open === r.id && (
                <>
                  {!!r.message && <Text style={styles.body}>{r.message}</Text>}
                  <Text style={styles.muted}>
                    {r.kind === "notification" ? `In-app notification, ${r.read ? "read" : "not read yet"}` : "Delivery attempt"}
                    {r.severity ? ` · ${r.severity}` : ""} · id {r.id}
                  </Text>
                </>
              )}
            </Pressable>
          ))}
          {(data?.items.length ?? 0) === 0 && <Text style={styles.muted}>Nothing in the log for these filters.</Text>}
          <View style={styles.row}>
            <Text style={[styles.muted, { flex: 1 }]}>{data ? `${data.total.toLocaleString()} entries` : ""}</Text>
            <Button variant="outline" disabled={page === 0} onPress={() => setPage((n) => n - 1)}>Previous</Button>
            <Button variant="outline" disabled={!data || (page + 1) * 50 >= data.total} onPress={() => setPage((n) => n + 1)}>Next</Button>
          </View>
        </>
      )}
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    stack: { gap: spacing.sm },
    row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
    chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: typography.small, fontWeight: "600", color: colors.mutedForeground },
    chipTextOn: { color: colors.white },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: typography.body, color: colors.foreground, backgroundColor: colors.card },
    card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.card, padding: spacing.md, gap: spacing.xs },
    cardTitle: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    h2: { fontSize: typography.h2, fontWeight: "800", color: colors.foreground, marginTop: spacing.sm },
    body: { fontSize: typography.body, color: colors.foreground },
    bold: { fontWeight: "800" },
    big: { fontSize: typography.h2, fontWeight: "800", color: colors.foreground },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    error: { fontSize: typography.small, color: colors.destructive },
    kpis: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    kpi: { flexGrow: 1, flexBasis: "45%", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.card, padding: spacing.md },
    kpiLabel: { fontSize: typography.tiny, fontWeight: "700", color: colors.mutedForeground, textTransform: "uppercase" },
    kpiValue: { fontSize: typography.h2, fontWeight: "800", color: colors.foreground },
    listRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm },
    bars: { flexDirection: "row", alignItems: "flex-end", gap: 1, height: 90 },
    barCol: { flex: 1, backgroundColor: colors.primary, borderRadius: 2, minHeight: 2 },
    axis: { flexDirection: "row", justifyContent: "space-between" },
    heatRow: { flexDirection: "row", alignItems: "center", gap: 1, marginBottom: 1 },
    heatDay: { width: 30, fontSize: typography.tiny, color: colors.mutedForeground },
    heatCell: { flex: 1, height: 14, borderRadius: 2, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
    sheet: { maxHeight: "85%", backgroundColor: colors.background, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
    sheetBody: { padding: spacing.lg, paddingBottom: spacing.xl * 2, gap: spacing.sm },
  }),
);
