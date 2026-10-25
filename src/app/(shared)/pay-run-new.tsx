import { useEffect, useMemo, useRef, useState } from "react";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { SelectField } from "@/components/SelectField";
import { appAlert } from "@/components/Dialog";
import {
  createPayRun,
  finalisePayRun,
  getPayRun,
  listPayRules,
  previewPayRun,
  updatePayRun,
  type PayAdjustment,
  type PayHoliday,
  type PayManualEntry,
  type PayPerson,
  type PayPreview,
  type PayRuleRecord,
  type PayRunInput,
} from "@/api/client";
import { formatDays, formatHours, formatMoney } from "@/domain/payroll";
import { useCanUsePayroll } from "@/features/payroll";
import { useHomePath } from "@/features/roles";
import { useSmartClean } from "@/features/store";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

const STANDARD = "Standard day (8 hours)";
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n: number) => String(n).padStart(2, "0");
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function preset(which: "month" | "last" | "14"): [string, string] {
  const now = new Date();
  if (which === "month") return [key(new Date(now.getFullYear(), now.getMonth(), 1)), key(now)];
  if (which === "last") return [key(new Date(now.getFullYear(), now.getMonth() - 1, 1)), key(new Date(now.getFullYear(), now.getMonth(), 0))];
  return [key(new Date(now.getTime() - 13 * 86_400_000)), key(now)];
}

/** Three short steps: the period, the people and their days, then rates and pay. */
export default function PayRunNewScreen() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { state } = useSmartClean();
  const token = state.accessToken;
  const allowed = useCanUsePayroll();
  const homePath = useHomePath();
  const { draft } = useLocalSearchParams<{ draft?: string }>();

  const [title, setTitle] = useState("");
  const [[start, end], setRange] = useState<[string, string]>(() => preset("month"));
  const [siteIds, setSiteIds] = useState<string[]>([]);
  const [rules, setRules] = useState<PayRuleRecord[]>([]);
  const [ruleName, setRuleName] = useState(STANDARD);
  const [loadedRuleId, setLoadedRuleId] = useState<string | null>(null);
  const [holidays, setHolidays] = useState<PayHoliday[]>([]);
  const [rates, setRates] = useState<Record<string, string>>({});
  const [adjustments, setAdjustments] = useState<Record<string, PayAdjustment[]>>({});
  const [manual, setManual] = useState<Record<string, PayManualEntry[]>>({});
  const [includeUserIds, setIncludeUserIds] = useState<string[]>([]);
  // Left out on purpose: a run can cover everyone, one person, or a chosen few.
  const [excluded, setExcluded] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [bulkRate, setBulkRate] = useState("");
  const [preview, setPreview] = useState<PayPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [moreOpen, setMoreOpen] = useState(false);
  const prefilled = useRef(new Set<string>());

  useEffect(() => {
    if (!token || !allowed) return;
    listPayRules(token).then(setRules).catch(() => setRules([]));
  }, [token, allowed]);

  // The rule picked by name; a draft's saved rule is selected once the rules have loaded.
  const ruleId = ruleName === STANDARD ? null : (rules.find((r) => r.name === ruleName)?.id ?? null);
  useEffect(() => {
    if (loadedRuleId && rules.length) {
      const found = rules.find((r) => r.id === loadedRuleId);
      if (found) setRuleName(found.name);
      setLoadedRuleId(null);
    }
  }, [loadedRuleId, rules]);

  // Editing a saved draft: bring its inputs back.
  useEffect(() => {
    if (!token || !draft) return;
    getPayRun(token, draft)
      .then((run) => {
        setTitle(run.title);
        setSiteIds(run.siteIds);
        setRange([run.periodStart, run.periodEnd]);
        setHolidays(run.holidays);
        setNotes(run.notes ?? "");
        setLoadedRuleId(run.ruleId);
        const saved: Record<string, string> = {};
        const adj: Record<string, PayAdjustment[]> = {};
        const typed: Record<string, PayManualEntry[]> = {};
        for (const p of run.people ?? []) {
          if (p.hasRate) {
            saved[p.userId] = p.rate;
            prefilled.current.add(p.userId);
          }
          if (p.adjustments.length) adj[p.userId] = p.adjustments;
          const rows = p.days.filter((d) => d.manual).map((d) => ({ label: d.label ?? "", date: d.date, days: d.fraction, hours: d.hoursEntered ?? null }));
          if (rows.length) typed[p.userId] = rows;
        }
        setRates(saved);
        setAdjustments(adj);
        setManual(typed);
        setIncludeUserIds((run.people ?? []).map((p) => p.userId));
        setExcluded(run.excludedUserIds ?? []);
        setStep(3);
      })
      .catch((e) => appAlert("Could not open the draft", e instanceof Error ? e.message : "Please try again."));
  }, [token, draft]);

  const input: PayRunInput = useMemo(
    () => ({
      title: title.trim() || `Pay run ${start} to ${end}`,
      siteIds,
      start,
      end,
      ruleId,
      rule: ruleId ? null : {},
      holidays: holidays.filter((h) => DATE.test(h.date)),
      rates: Object.fromEntries(Object.entries(rates).map(([id, r]) => [id, r.trim() === "" ? null : r.trim()])),
      adjustments: Object.fromEntries(Object.entries(adjustments).map(([id, list]) => [id, list.filter((a) => a.label.trim() && a.amount.trim() !== "")])),
      manual: Object.fromEntries(Object.entries(manual).map(([id, list]) => [id, list.filter((m) => Number(m.days) > 0)])),
      includeUserIds,
      excludeUserIds: excluded,
      notes: notes.trim() || null,
    }),
    [title, siteIds, start, end, ruleId, holidays, rates, adjustments, manual, includeUserIds, excluded, notes],
  );

  // Work the figures out on the server a moment after anything changes.
  const inputKey = JSON.stringify(input);
  useEffect(() => {
    if (!token || !allowed || !DATE.test(start) || !DATE.test(end)) return;
    let live = true;
    const timer = setTimeout(() => {
      previewPayRun(token, input)
        .then((result) => {
          if (!live) return;
          setPreview(result);
          setError(null);
          const fill: Record<string, string> = {};
          for (const p of result.people) {
            const last = result.lastRates[p.userId];
            if (last && !prefilled.current.has(p.userId)) fill[p.userId] = last;
            prefilled.current.add(p.userId);
          }
          if (Object.keys(fill).length) setRates((r) => ({ ...fill, ...r }));
        })
        .catch((e) => live && setError(e instanceof Error ? e.message : "Could not work out the pay"));
    }, 600);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, allowed, inputKey]);

  const everyone = preview?.people ?? [];
  const people = everyone.filter((p) => p.included !== false);
  const setIncluded = (userId: string, on: boolean) =>
    setExcluded((ids) => (on ? ids.filter((id) => id !== userId) : ids.includes(userId) ? ids : [...ids, userId]));
  const missing = people.filter((p) => Number(p.daysCounted) > 0 && !p.hasRate);
  const unapproved = people.reduce((n, p) => n + (p.unapprovedDays ?? 0), 0);

  const save = async (finalise: boolean) => {
    if (!token) return;
    let run = draft ? await updatePayRun(token, draft, input) : await createPayRun(token, input);
    if (finalise) run = await finalisePayRun(token, run.id);
    router.replace(`/pay-runs/${run.id}` as never);
  };
  const confirmFinalise = () =>
    appAlert(
      "Finalise this run?",
      `The figures are frozen as they are now${unapproved ? ` (${unapproved} unapproved day${unapproved === 1 ? "" : "s"} will not be paid)` : ""}.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Finalise", onPress: () => void save(true).catch((e) => appAlert("Could not finalise", e instanceof Error ? e.message : "Please try again.")) },
      ],
    );

  if (!allowed) return <Redirect href={homePath as never} />;

  const dateOk = DATE.test(start) && DATE.test(end) && start <= end;
  const sites = state.sites.filter((s) => s.active);
  const candidates = preview?.candidates ?? [];
  const candidateLabel = (c: { name: string; role: string }) => `${c.name} (${c.role.replace(/_/g, " ")})`;
  const go = (n: 1 | 2 | 3) => {
    if (n > 1 && !dateOk) return;
    if (n === 3 && people.length === 0) return;
    setStep(n);
  };
  const periodText = dateOk ? `${start} to ${end}` : "the chosen dates";
  const gross = preview ? Number(preview.totals.gross) : 0;

  return (
    <Screen title={draft ? "Edit pay run" : "New pay run"}>
      <View style={styles.stepper}>
        {(["Period", "People", "Rates and pay"] as const).map((label, i) => {
          const n = (i + 1) as 1 | 2 | 3;
          const current = n === step;
          const done = n < step;
          return (
            <Pressable key={label} style={[styles.stepItem, current && styles.stepItemOn]} onPress={() => go(n)} accessibilityRole="button" accessibilityState={{ selected: current }}>
              <View style={[styles.stepDot, (current || done) && styles.stepDotOn]}>
                {done ? <Ionicons name="checkmark" size={12} color={colors.white} /> : <Text style={[styles.stepNum, (current || done) && styles.stepNumOn]}>{n}</Text>}
              </View>
              <Text style={[styles.stepLabel, current && styles.stepLabelOn]} numberOfLines={1}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {step > 1 && preview && (
        <View style={styles.strip}>
          <Text style={[styles.muted, styles.flex]}>
            {people.length} {people.length === 1 ? "person" : "people"} · {formatDays(preview.totals.daysCounted)} days · {formatHours(preview.totals.paidHours)}
          </Text>
          {gross > 0 && <Text style={styles.stripGross}>{formatMoney(preview.totals.gross)}</Text>}
        </View>
      )}
      {error && <Text style={styles.error}>{error}</Text>}

      {step === 1 && (
        <Card style={styles.card}>
          <Text style={styles.heading}>When is this pay for?</Text>
          <View style={styles.chips}>
            {([["month", "This month"], ["last", "Last month"], ["14", "Last 14 days"]] as const).map(([k, label]) => (
              <Pressable key={k} style={styles.chip} onPress={() => setRange(preset(k))}>
                <Text style={styles.chipText}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>From and to (year-month-day)</Text>
          <View style={styles.pair}>
            <TextInput style={[styles.input, styles.flex]} value={start} onChangeText={(v) => setRange([v, end])} placeholder="2026-10-01" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" />
            <TextInput style={[styles.input, styles.flex]} value={end} onChangeText={(v) => setRange([start, v])} placeholder="2026-10-31" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" />
          </View>
          {!dateOk && <Text style={styles.error}>Use the form 2026-10-31, with the end on or after the start.</Text>}
          {sites.length > 1 && (
            <>
              <Text style={styles.label}>Which sites? Leave all unticked for every site.</Text>
              <View style={styles.chips}>
                {sites.map((s) => {
                  const on = siteIds.includes(s.id);
                  return (
                    <Pressable key={s.id} style={[styles.chip, on && styles.chipOn]} onPress={() => setSiteIds((ids) => (on ? ids.filter((i) => i !== s.id) : [...ids, s.id]))}>
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{s.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
          <Text style={styles.label}>Name (optional)</Text>
          <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="e.g. October, second fortnight" placeholderTextColor={colors.mutedForeground} />

          <View style={styles.more}>
            <View style={styles.pair}>
              <View style={styles.flex}>
                <Text style={styles.subheading}>How days are paid</Text>
                <Text style={styles.muted}>{preview?.ruleDescription ?? "Standard day, approved days only."}</Text>
              </View>
              <Pressable onPress={() => setMoreOpen((o) => !o)} accessibilityRole="button">
                <Text style={styles.link}>{moreOpen ? "Hide" : "Change"}</Text>
              </Pressable>
            </View>
            {moreOpen && (
              <View style={styles.moreBody}>
                <SelectField label="Pay rule" value={ruleName} options={[STANDARD, ...rules.map((r) => r.name)]} onChange={setRuleName} />
                <Text style={styles.label}>Public holidays in this period</Text>
                {holidays.map((h, i) => (
                  <View key={i} style={styles.pair}>
                    <TextInput style={[styles.input, styles.flex]} value={h.date} placeholder="2026-10-10" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" onChangeText={(v) => setHolidays((hs) => hs.map((x, j) => (j === i ? { ...x, date: v } : x)))} />
                    <TextInput style={[styles.input, styles.narrow]} value={String(h.multiplier)} keyboardType="decimal-pad" onChangeText={(v) => setHolidays((hs) => hs.map((x, j) => (j === i ? { ...x, multiplier: v } : x)))} />
                    <Pressable accessibilityLabel="Remove holiday" onPress={() => setHolidays((hs) => hs.filter((_, j) => j !== i))}>
                      <Ionicons name="trash-outline" size={20} color={colors.mutedForeground} />
                    </Pressable>
                  </View>
                ))}
                <Pressable onPress={() => setHolidays((hs) => [...hs, { date: "", multiplier: "2" }])}>
                  <Text style={styles.link}>+ Add a public holiday (pays double)</Text>
                </Pressable>
                <Text style={styles.label}>Notes (printed on the summary)</Text>
                <TextInput style={[styles.input, styles.multiline]} value={notes} onChangeText={setNotes} multiline />
              </View>
            )}
          </View>
          <Button disabled={!dateOk} onPress={() => go(2)}>Next: choose people</Button>
        </Card>
      )}

      {step === 2 && (
        <Card style={styles.card}>
          <Text style={styles.heading}>Who is being paid?</Text>
          <Text style={styles.muted}>
            {!preview && !error
              ? "Looking for attendance..."
              : everyone.length > 0
                ? `Everyone with attendance from ${periodText} is listed. Untick anyone who should not be in this run.`
                : `There is no attendance for ${periodText}. You can still pay people: add them below and type in the days they worked.`}
          </Text>
          {!preview && !error && <ActivityIndicator color={colors.primary} />}
          {unapproved > 0 && (
            <View style={styles.warn}>
              <Text style={styles.warnText}>{unapproved} day{unapproved === 1 ? " is" : "s are"} not approved in the Timesheet yet, so {unapproved === 1 ? "it is" : "they are"} not paid.</Text>
            </View>
          )}
          {everyone.length > 1 && (
            <View style={styles.pair}>
              <Pressable onPress={() => setExcluded([])}><Text style={styles.link}>Tick everyone</Text></Pressable>
              <Pressable onPress={() => setExcluded(everyone.map((p) => p.userId))}><Text style={styles.link}>Untick everyone</Text></Pressable>
            </View>
          )}
          {everyone.map((p) => (
            <PersonRow
              key={p.userId}
              person={p}
              included={p.included !== false}
              onIncluded={(on) => setIncluded(p.userId, on)}
              open={expanded === p.userId}
              onToggle={() => setExpanded(expanded === p.userId ? null : p.userId)}
              manual={manual[p.userId] ?? []}
              onManual={(rows) => setManual((m) => ({ ...m, [p.userId]: rows }))}
            />
          ))}
          {preview && candidates.length > 0 && (
            <View style={styles.more}>
              <SelectField
                label="Someone not listed? Add a person"
                value="Choose a person"
                options={candidates.map(candidateLabel)}
                onChange={(label) => {
                  const found = candidates.find((c) => candidateLabel(c) === label);
                  if (!found) return;
                  setIncludeUserIds((ids) => (ids.includes(found.userId) ? ids : [...ids, found.userId]));
                  setExpanded(found.userId);
                }}
              />
            </View>
          )}
          <View style={styles.pair}>
            <Button style={styles.flex} variant="outline" onPress={() => go(1)}>Back</Button>
            <Button style={styles.flex} disabled={people.length === 0} onPress={() => go(3)}>Next: rates</Button>
          </View>
        </Card>
      )}

      {step === 3 && (
        <>
          <Card style={styles.card}>
            <Text style={styles.heading}>What is each person paid per hour?</Text>
            <Text style={styles.muted}>Type each hourly rate. The pay is worked out as you type.</Text>
            <View style={styles.pair}>
              <TextInput style={[styles.input, styles.flex]} value={bulkRate} onChangeText={setBulkRate} keyboardType="decimal-pad" placeholder="Same rate for everyone" placeholderTextColor={colors.mutedForeground} />
              <Button fullWidth={false} variant="outline" disabled={!bulkRate.trim()} onPress={() => setRates(Object.fromEntries(people.map((p) => [p.userId, bulkRate.trim()])))}>
                Use for all
              </Button>
            </View>
            {people.map((p) => (
              <RateRow
                key={p.userId}
                person={p}
                rate={rates[p.userId] ?? ""}
                onRate={(v) => setRates((r) => ({ ...r, [p.userId]: v }))}
                open={expanded === p.userId}
                onToggle={() => setExpanded(expanded === p.userId ? null : p.userId)}
                adjustments={adjustments[p.userId] ?? []}
                onAdjustments={(rows) => setAdjustments((a) => ({ ...a, [p.userId]: rows }))}
              />
            ))}
            {preview && (
              <View style={styles.totals}>
                <Text style={styles.totalText}>
                  {people.length} {people.length === 1 ? "person" : "people"} · {formatDays(preview.totals.daysCounted)} days · {formatHours(preview.totals.paidHours)}
                </Text>
                <Text style={styles.totalGross}>{formatMoney(preview.totals.gross)}</Text>
              </View>
            )}
            {missing.length > 0 && <Text style={styles.warnText}>Still needs a rate: {missing.map((p) => p.name).join(", ")}.</Text>}
          </Card>
          <Button variant="outline" disabled={people.length === 0 || !dateOk} onPress={() => save(false)}>Save as draft</Button>
          <Button style={styles.gap} disabled={people.length === 0 || missing.length > 0 || !dateOk} onPress={confirmFinalise}>Finalise</Button>
          <Button style={styles.gap} variant="ghost" onPress={() => go(2)}>Back</Button>
        </>
      )}
    </Screen>
  );
}

/** Step 2: one person, with a tick box, their days, and (opened) their typed-in days and the day list. */
function PersonRow({
  person: p,
  included,
  onIncluded,
  open,
  onToggle,
  manual,
  onManual,
}: {
  person: PayPerson;
  included: boolean;
  onIncluded: (on: boolean) => void;
  open: boolean;
  onToggle: () => void;
  manual: PayManualEntry[];
  onManual: (rows: PayManualEntry[]) => void;
}) {
  const setM = (i: number, patch: Partial<PayManualEntry>) => onManual(manual.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  return (
    <View style={[styles.person, !included && styles.left]}>
      <View style={styles.pair}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: included }}
          accessibilityLabel={`Include ${p.name}`}
          onPress={() => onIncluded(!included)}
          hitSlop={8}
          style={[styles.box, included && styles.boxOn]}
        >
          {included && <Ionicons name="checkmark" size={14} color={colors.white} />}
        </Pressable>
        <View style={styles.flex}>
          <Text style={styles.personName}>{p.name}</Text>
          <Text style={styles.muted}>
            {formatDays(p.daysCounted)} days · {formatHours(p.paidHours)}
            {p.daysExcluded > 0 ? ` · ${p.daysExcluded} left out` : ""}
          </Text>
        </View>
        <Pressable onPress={onToggle} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.link}>{open ? "Done" : manual.length ? "Edit days" : "Details"}</Text>
        </Pressable>
      </View>
      {open && (
        <View style={styles.detail}>
          <Text style={styles.subheading}>Days worked, typed in</Text>
          <Text style={styles.muted}>For when attendance is off or someone was not clocked in. Leave hours empty for a standard day.</Text>
          {manual.map((m, i) => (
            <View key={i} style={styles.rowBlock}>
              <View style={styles.pair}>
                <TextInput accessibilityLabel="Days" style={[styles.input, styles.narrow]} value={m.days} onChangeText={(v) => setM(i, { days: v })} keyboardType="decimal-pad" placeholder="Days" placeholderTextColor={colors.mutedForeground} />
                <TextInput accessibilityLabel="Hours per day" style={[styles.input, styles.narrow]} value={m.hours ?? ""} onChangeText={(v) => setM(i, { hours: v || null })} keyboardType="decimal-pad" placeholder="Hours/day" placeholderTextColor={colors.mutedForeground} />
                <TextInput accessibilityLabel="Date (optional)" style={[styles.input, styles.flex]} value={m.date ?? ""} onChangeText={(v) => setM(i, { date: v || null })} placeholder="Date (optional)" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" />
                <Pressable accessibilityLabel="Remove days" onPress={() => onManual(manual.filter((_, j) => j !== i))}>
                  <Ionicons name="trash-outline" size={20} color={colors.mutedForeground} />
                </Pressable>
              </View>
              <TextInput accessibilityLabel="Note" style={styles.input} value={m.label} onChangeText={(v) => setM(i, { label: v })} placeholder="Note (optional)" placeholderTextColor={colors.mutedForeground} />
            </View>
          ))}
          <Pressable onPress={() => onManual([...manual, { label: "", date: null, days: "1", hours: null }])}>
            <Text style={styles.link}>+ Add days</Text>
          </Pressable>
          {p.days.length > 0 && <Text style={styles.subheading}>Days behind this figure</Text>}
          {p.days.map((d) => (
            <View key={d.dayId} style={styles.line}>
              <Text style={styles.muted}>{d.date ?? d.label ?? "Entered by hand"}</Text>
              <Text style={d.counted ? styles.muted : styles.warnText}>
                {d.counted ? `${formatHours(d.paidHours)}${Number(d.multiplier) !== 1 ? ` (x${Number(d.multiplier)})` : ""}` : d.reason}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/** Step 3: one person's rate and pay, with an optional bonus or deduction. */
function RateRow({
  person: p,
  rate,
  onRate,
  open,
  onToggle,
  adjustments,
  onAdjustments,
}: {
  person: PayPerson;
  rate: string;
  onRate: (v: string) => void;
  open: boolean;
  onToggle: () => void;
  adjustments: PayAdjustment[];
  onAdjustments: (rows: PayAdjustment[]) => void;
}) {
  const setA = (i: number, patch: Partial<PayAdjustment>) => onAdjustments(adjustments.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  return (
    <View style={styles.person}>
      <View style={styles.pair}>
        <View style={styles.flex}>
          <Text style={styles.personName}>{p.name}</Text>
          <Text style={styles.muted}>
            {formatDays(p.daysCounted)} days · {formatHours(p.paidHours)}
          </Text>
        </View>
        <Text style={styles.personGross}>{formatMoney(p.gross)}</Text>
      </View>
      <View style={styles.pair}>
        <Text style={styles.muted}>Rate per hour</Text>
        <TextInput accessibilityLabel={`Rate for ${p.name}`} style={[styles.input, styles.narrow]} value={rate} onChangeText={onRate} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.mutedForeground} />
      </View>
      <Pressable onPress={onToggle} accessibilityRole="button">
        <Text style={styles.link}>{open ? "Hide bonus or deduction" : adjustments.length ? `Bonus or deduction (${formatMoney(p.adjustmentTotal)})` : "+ Bonus or deduction"}</Text>
      </Pressable>
      {open && (
        <View style={styles.detail}>
          {adjustments.map((a, i) => (
            <View key={i} style={styles.pair}>
              <TextInput accessibilityLabel="Adjustment label" style={[styles.input, styles.flex]} value={a.label} onChangeText={(v) => setA(i, { label: v })} placeholder="What for" placeholderTextColor={colors.mutedForeground} />
              <TextInput accessibilityLabel="Adjustment amount" style={[styles.input, styles.narrow]} value={a.amount} onChangeText={(v) => setA(i, { amount: v })} keyboardType="numbers-and-punctuation" placeholder="-20 or 50" placeholderTextColor={colors.mutedForeground} />
              <Pressable accessibilityLabel="Remove adjustment" onPress={() => onAdjustments(adjustments.filter((_, j) => j !== i))}>
                <Ionicons name="trash-outline" size={20} color={colors.mutedForeground} />
              </Pressable>
            </View>
          ))}
          <Pressable onPress={() => onAdjustments([...adjustments, { label: "", amount: "" }])}>
            <Text style={styles.link}>+ Add one (use a minus sign for a deduction)</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    card: { marginBottom: spacing.md, gap: spacing.sm },
    heading: { fontSize: typography.body, fontWeight: "800", color: colors.foreground },
    subheading: { fontSize: typography.small, fontWeight: "700", color: colors.foreground, marginTop: spacing.sm },
    label: { fontSize: typography.small, fontWeight: "600", color: colors.mutedForeground, marginTop: spacing.xs },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    error: { fontSize: typography.small, color: colors.destructive },
    link: { fontSize: typography.small, fontWeight: "700", color: colors.primary },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      color: colors.foreground,
      backgroundColor: colors.card,
      fontSize: typography.body,
    },
    multiline: { minHeight: 64, textAlignVertical: "top" },
    flex: { flex: 1, minWidth: 0 },
    narrow: { width: 92 },
    pair: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: typography.small, fontWeight: "600", color: colors.mutedForeground },
    chipTextOn: { color: colors.white },
    warn: { padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.warningSoft, gap: 2 },
    warnText: { fontSize: typography.small, color: colors.foreground },
    person: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, gap: spacing.xs },
    personHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    personName: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    personGross: { fontSize: typography.body, fontWeight: "800", color: colors.foreground },
    detail: { gap: spacing.xs, paddingTop: spacing.xs },
    rowBlock: { gap: spacing.xs },
    line: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
    totals: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 2, borderTopColor: colors.border, paddingTop: spacing.sm },
    totalText: { fontSize: typography.body, color: colors.foreground },
    totalGross: { fontSize: 20, fontWeight: "800", color: colors.foreground },
    gap: { marginTop: spacing.sm },
    stepper: { flexDirection: "row", gap: spacing.xs, marginBottom: spacing.md },
    stepItem: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    stepItemOn: { borderColor: colors.primary },
    stepDot: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.border },
    stepDotOn: { backgroundColor: colors.primary },
    stepNum: { fontSize: 11, fontWeight: "800", color: colors.mutedForeground },
    stepNumOn: { color: colors.white },
    stepLabel: { flexShrink: 1, fontSize: typography.small, color: colors.mutedForeground },
    stepLabelOn: { color: colors.foreground, fontWeight: "700" },
    strip: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.card, marginBottom: spacing.sm },
    stripGross: { fontSize: typography.body, fontWeight: "800", color: colors.foreground },
    more: { padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
    moreBody: { gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
    left: { opacity: 0.5 },
    box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
    boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  }),
);
