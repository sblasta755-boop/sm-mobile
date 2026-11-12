import { useEffect, useState } from "react";
import { Redirect, router } from "expo-router";
import { ActivityIndicator, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { SelectField } from "@/components/SelectField";
import { appAlert } from "@/components/Dialog";
import { getPaySettings, savePaySettings, type PayFeature, type PayFrequency, type PaySettings } from "@/api/client";
import { useCanUsePayroll } from "@/features/payroll";
import { useHomePath } from "@/features/roles";
import { useSmartClean } from "@/features/store";
import { colors, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const FREQUENCIES: [PayFrequency, string][] = [
  ["weekly", "Weekly"],
  ["biweekly", "Every two weeks"],
  ["semimonthly", "Twice a month"],
  ["monthly", "Monthly"],
  ["custom", "Per event / any dates"],
];
const FEATURES: { key: PayFeature; label: string; hint: string; needs?: PayFeature }[] = [
  { key: "staff_pay", label: "Staff pay from attendance", hint: "Gross pay from approved days, hours and rates." },
  { key: "pay_schedule", label: "Pay schedule", hint: "Suggest periods that match how you pay." },
  { key: "auto_create_runs", label: "Create draft runs automatically", hint: "A draft appears when a period ends.", needs: "pay_schedule" },
  { key: "flat_lines", label: "Flat fees and fines", hint: "DJs, MCs, lump sums and deductions." },
  { key: "tip_pools", label: "Tip pools", hint: "Share a tip amount between staff.", needs: "staff_pay" },
  { key: "payables", label: "Suppliers and outstanding", hint: "Pay suppliers and track what is still owed." },
];

/** Which pay features this organisation uses, and how often it pays. */
export default function PaySettingsScreen() {
  useThemeVersion();
  const { state } = useSmartClean();
  const token = state.accessToken;
  const allowed = useCanUsePayroll();
  const homePath = useHomePath();
  const [form, setForm] = useState<PaySettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token || !allowed) return;
    getPaySettings(token)
      .then(setForm)
      .catch((e) => appAlert("Could not load pay settings", e instanceof Error ? e.message : "Please try again."));
  }, [token, allowed]);

  if (!allowed) return <Redirect href={homePath as never} />;

  const setFeature = (key: PayFeature, on: boolean) =>
    setForm((f) => {
      if (!f) return f;
      const features = { ...f.features, [key]: on };
      for (const item of FEATURES) if (item.needs && !features[item.needs]) features[item.key] = false;
      return { ...f, features };
    });

  const save = async () => {
    if (!form || !token) return;
    setSaving(true);
    try {
      await savePaySettings(token, form);
      router.back();
    } catch (e) {
      appAlert("Could not save", e instanceof Error ? e.message : "Please try again.", undefined, "danger");
    } finally {
      setSaving(false);
    }
  };

  const s = form?.schedule;
  const num = (v: string) => (v === "" ? 0 : Number(v.replace(/\D/g, "")) || 0);

  return (
    <Screen title="Pay settings">
      {!form || !s ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <>
          <Card style={styles.card}>
            {FEATURES.map((f, i) => {
              const blocked = !!f.needs && !form.features[f.needs];
              return (
                <View key={f.key} style={[styles.row, i > 0 && styles.divider, blocked && styles.dim]}>
                  <View style={styles.copy}>
                    <Text style={styles.label}>{f.label}</Text>
                    <Text style={styles.hint}>{f.hint}</Text>
                  </View>
                  <Switch
                    value={form.features[f.key]}
                    disabled={blocked || saving}
                    onValueChange={(on) => setFeature(f.key, on)}
                    trackColor={{ true: colors.primary, false: colors.neutral }}
                    accessibilityLabel={f.label}
                  />
                </View>
              );
            })}
          </Card>

          {form.features.pay_schedule && (
            <Card style={styles.card}>
              <SelectField
                label="How often do you pay?"
                value={FREQUENCIES.find(([v]) => v === s.frequency)?.[1] ?? ""}
                options={FREQUENCIES.map(([, l]) => l)}
                onChange={(l) => setForm({ ...form, schedule: { ...s, frequency: FREQUENCIES.find(([, x]) => x === l)![0] } })}
              />
              {(s.frequency === "weekly" || s.frequency === "biweekly") && (
                <SelectField
                  label="Week starts on"
                  value={DAYS[s.weekStart]}
                  options={DAYS}
                  onChange={(d) => setForm({ ...form, schedule: { ...s, weekStart: DAYS.indexOf(d) } })}
                />
              )}
              {s.frequency === "biweekly" && (
                <>
                  <Text style={styles.hint}>First day of any pay period (year-month-day)</Text>
                  <TextInput
                    style={styles.input}
                    value={s.anchorDate ?? ""}
                    onChangeText={(v) => setForm({ ...form, schedule: { ...s, anchorDate: v || null } })}
                    placeholder="2026-11-02"
                    placeholderTextColor={colors.mutedForeground}
                    autoCapitalize="none"
                  />
                </>
              )}
              {s.frequency === "semimonthly" && (
                <>
                  <Text style={styles.hint}>First half ends on day (second half runs to month end)</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="number-pad"
                    value={String(s.semimonthlyDays[0])}
                    onChangeText={(v) => setForm({ ...form, schedule: { ...s, semimonthlyDays: [num(v) || 15, 31] } })}
                  />
                </>
              )}
              {s.frequency !== "custom" && (
                <>
                  <Text style={styles.hint}>Days from period end to pay day</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="number-pad"
                    value={String(s.payLagDays)}
                    onChangeText={(v) => setForm({ ...form, schedule: { ...s, payLagDays: num(v) } })}
                  />
                </>
              )}
            </Card>
          )}
          {form.features.pay_schedule && form.features.auto_create_runs && s.frequency !== "custom" && (
            <Card style={styles.card}>
              <Text style={styles.hint}>Days to wait after a period ends before its draft is made (time to approve timesheets)</Text>
              <TextInput
                style={styles.input}
                keyboardType="number-pad"
                value={String(s.autoCreateLeadDays)}
                onChangeText={(v) => setForm({ ...form, schedule: { ...s, autoCreateLeadDays: num(v) } })}
              />
            </Card>
          )}
          <Button onPress={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      )}
    </Screen>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    card: { marginBottom: spacing.md, gap: spacing.sm },
    row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
    divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    dim: { opacity: 0.5 },
    copy: { flex: 1, gap: 2 },
    label: { fontSize: typography.body, fontWeight: "600", color: colors.foreground },
    hint: { fontSize: typography.small, color: colors.mutedForeground },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
      color: colors.foreground,
      fontSize: typography.body,
    },
  }),
);
