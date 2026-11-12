import { useCallback, useState } from "react";
import { Redirect, useFocusEffect } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { StatusBadge } from "@/components/StatusBadge";
import { appAlert } from "@/components/Dialog";
import { createPayable, deletePayable, listPayables, type Payable } from "@/api/client";
import { formatMoney } from "@/domain/payroll";
import { useCanUsePayroll } from "@/features/payroll";
import { useHomePath } from "@/features/roles";
import { useSmartClean } from "@/features/store";
import { colors, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

const TONE = { open: "warning", partial: "info", paid: "success" } as const;

/** What is owed to suppliers and service providers, and how much of it is still outstanding. */
export default function PayablesScreen() {
  useThemeVersion();
  const { state } = useSmartClean();
  const token = state.accessToken;
  const allowed = useCanUsePayroll();
  const homePath = useHomePath();
  const [data, setData] = useState<{ items: Payable[]; outstanding: string } | null>(null);
  const [form, setForm] = useState({ payeeName: "", description: "", amount: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setData(await listPayables(token, "outstanding"));
    } catch (e) {
      appAlert("Could not load", e instanceof Error ? e.message : "Please try again.");
    }
  }, [token]);
  useFocusEffect(
    useCallback(() => {
      if (allowed) void load();
    }, [allowed, load]),
  );

  if (!allowed) return <Redirect href={homePath as never} />;

  const add = async () => {
    if (!token) return;
    setBusy(true);
    try {
      await createPayable(token, form);
      setForm({ payeeName: "", description: "", amount: "" });
      await load();
    } catch (e) {
      appAlert("Could not add", e instanceof Error ? e.message : "Please try again.", undefined, "danger");
    } finally {
      setBusy(false);
    }
  };

  const remove = (item: Payable) =>
    appAlert("Delete this item?", `${item.payee}: ${item.description}`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          if (!token) return;
          deletePayable(token, item.id)
            .then(load)
            .catch((e) => appAlert("Could not delete", e instanceof Error ? e.message : "Please try again."));
        },
      },
    ]);

  const ready = form.payeeName.trim() && form.description.trim() && form.amount.trim();
  return (
    <Screen title="Suppliers and outstanding">
      <Card style={styles.card}>
        <Text style={styles.heading}>Add an amount owed</Text>
        <TextInput style={styles.input} value={form.payeeName} onChangeText={(v) => setForm({ ...form, payeeName: v })} placeholder="Who is owed" placeholderTextColor={colors.mutedForeground} />
        <TextInput style={styles.input} value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} placeholder="What for" placeholderTextColor={colors.mutedForeground} />
        <TextInput style={styles.input} value={form.amount} onChangeText={(v) => setForm({ ...form, amount: v })} placeholder="Amount" keyboardType="decimal-pad" placeholderTextColor={colors.mutedForeground} />
        <Button onPress={() => void add()} disabled={busy || !ready}>
          Add
        </Button>
      </Card>

      {!data && <ActivityIndicator color={colors.primary} />}
      {data && (
        <>
          <Text style={styles.total}>Total outstanding {formatMoney(data.outstanding)}</Text>
          {data.items.length === 0 && (
            <Card>
              <Text style={styles.muted}>Nothing is owed.</Text>
            </Card>
          )}
          {data.items.map((i) => (
            <Card key={i.id} style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.title} numberOfLines={1}>{i.payee}</Text>
                <StatusBadge tone={TONE[i.status]} label={i.status} />
              </View>
              <Text style={styles.muted}>{i.description}</Text>
              <View style={styles.row}>
                <Text style={styles.muted}>
                  Paid {formatMoney(i.amountPaid)} of {formatMoney(i.amount)}
                </Text>
                <Text style={styles.left}>{formatMoney(i.remaining)} left</Text>
              </View>
              {Number(i.amountPaid) === 0 && (
                <Pressable accessibilityRole="button" accessibilityLabel="Delete" onPress={() => remove(i)} style={styles.delete}>
                  <Ionicons name="trash-outline" size={20} color={colors.destructive} />
                </Pressable>
              )}
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    card: { marginBottom: spacing.sm, gap: spacing.xs },
    heading: { fontSize: typography.body, fontWeight: "800", color: colors.foreground },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
    title: { flex: 1, fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    left: { fontSize: typography.body, fontWeight: "800", color: colors.foreground },
    total: { fontSize: typography.body, fontWeight: "800", color: colors.foreground, marginVertical: spacing.sm },
    delete: { alignSelf: "flex-end", padding: spacing.xs },
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
