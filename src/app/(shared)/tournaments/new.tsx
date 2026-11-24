import { useEffect, useState } from "react";
import { router } from "expo-router";
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { appAlert } from "@/components/Dialog";
import {
  createTournament,
  listPoolTables,
  type PoolTableChoice,
  type TournamentFormat,
} from "@/api/client";
import { START_CHOICES } from "@/domain/tournament";
import { useSmartClean } from "@/features/store";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

/** Set up a tournament on a site's pool tables. Start times are offered as simple choices rather than a date picker. */
export default function NewTournamentScreen() {
  useThemeVersion();
  const { state, currentUser } = useSmartClean();
  const token = state.accessToken;
  const sites = state.sites.filter((s) => currentUser?.role === "org_admin" || currentUser?.siteIds.includes(s.id));
  const [name, setName] = useState("");
  const [format, setFormat] = useState<TournamentFormat>("single_elim");
  const [siteId, setSiteId] = useState(sites[0]?.id ?? "");
  const [tables, setTables] = useState<PoolTableChoice[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [startHours, setStartHours] = useState(1);
  const [maxPlayers, setMaxPlayers] = useState("");
  const [open, setOpen] = useState(true);
  const [take, setTake] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token || !siteId) return;
    setTables(null);
    setPicked([]);
    listPoolTables(token, siteId)
      .then(setTables)
      .catch((e) => {
        setTables([]);
        appAlert("Could not load pool tables", e instanceof Error ? e.message : undefined);
      });
  }, [token, siteId]);

  const shown = (tables ?? []).filter(
    (t) => !filter.trim() || t.name.toLowerCase().includes(filter.trim().toLowerCase()),
  );
  const taking = (tables ?? []).filter((t) => picked.includes(t.id) && t.heldBy);
  const ready = name.trim() && siteId && picked.length > 0 && (taking.length === 0 || take);

  const submit = async () => {
    if (!token) return;
    setSaving(true);
    try {
      const created = await createTournament(token, {
        name: name.trim(),
        format,
        siteId,
        locationIds: picked,
        startsAt: new Date(Date.now() + startHours * 3_600_000).toISOString(),
        maxPlayers: maxPlayers ? Number(maxPlayers) : null,
        openRegistration: open,
        takeTables: take,
      });
      router.replace(`/tournaments/${created.id}` as never);
    } catch (e) {
      appAlert("Could not create the tournament", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const chip = (label: string, on: boolean, onPress: () => void) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.chip, on && styles.chipOn]}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );

  return (
    <Screen
      title="New tournament"
      backTo="/tournaments"
      footer={
        <Button disabled={!ready || saving} loading={saving} onPress={submit}>
          Create
        </Button>
      }
    >
      <View style={styles.stack}>
        <View style={styles.field}>
          <Text style={styles.label}>Name</Text>
          <TextInput value={name} onChangeText={setName} maxLength={120} style={styles.input} accessibilityLabel="Name" />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Format</Text>
          <View style={styles.chips}>
            {chip("Knockout", format === "single_elim", () => setFormat("single_elim"))}
            {chip("Round robin", format === "round_robin", () => setFormat("round_robin"))}
          </View>
        </View>

        {sites.length > 1 && (
          <View style={styles.field}>
            <Text style={styles.label}>Site</Text>
            <View style={styles.chips}>{sites.map((s) => chip(s.name, s.id === siteId, () => setSiteId(s.id)))}</View>
          </View>
        )}

        <View style={styles.field}>
          <Text style={styles.label}>Pool tables</Text>
          <TextInput
            value={filter}
            onChangeText={setFilter}
            placeholder="Search tables"
            placeholderTextColor={colors.mutedForeground}
            style={styles.input}
            accessibilityLabel="Search pool tables"
          />
          {tables === null ? (
            <Text style={styles.muted}>Loading tables...</Text>
          ) : shown.length === 0 ? (
            <Text style={styles.muted}>
              {tables.length === 0 ? "This site has no pool tables." : "No table matches."}
            </Text>
          ) : (
            shown.map((t) => {
              const on = picked.includes(t.id);
              return (
                <Pressable
                  key={t.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  onPress={() => setPicked((p) => (on ? p.filter((x) => x !== t.id) : [...p, t.id]))}
                >
                  <Card>
                    <View style={styles.row}>
                      <Ionicons
                        name={on ? "checkbox" : "square-outline"}
                        size={22}
                        color={on ? colors.primary : colors.mutedForeground}
                      />
                      <Text style={[styles.body, styles.grow]}>{t.name}</Text>
                      {!t.hasQr && <Text style={styles.muted}>No QR code</Text>}
                      {t.heldBy && <Text style={styles.muted}>In {t.heldBy.name}</Text>}
                    </View>
                  </Card>
                </Pressable>
              );
            })
          )}
          {taking.length > 0 && (
            <View style={styles.row}>
              <Switch value={take} onValueChange={setTake} />
              <Text style={[styles.muted, styles.grow]}>
                Move {taking.map((t) => t.name).join(", ")} out of {taking.length === 1 ? "its" : "their"} current
                tournament into this one.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Starts</Text>
          <View style={styles.chips}>
            {START_CHOICES.map((c) => chip(c.label, c.hours === startHours, () => setStartHours(c.hours)))}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Player limit (optional)</Text>
          <TextInput
            value={maxPlayers}
            onChangeText={(v) => setMaxPlayers(v.replace(/[^0-9]/g, ""))}
            keyboardType="number-pad"
            style={styles.input}
            accessibilityLabel="Player limit"
          />
        </View>

        <View style={styles.row}>
          <Text style={[styles.body, styles.grow]}>Open registration now</Text>
          <Switch value={open} onValueChange={setOpen} />
        </View>
      </View>
    </Screen>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    stack: { gap: spacing.lg },
    field: { gap: spacing.sm },
    label: { fontSize: typography.small, color: colors.mutedForeground, fontWeight: "700" },
    body: { fontSize: typography.body, color: colors.foreground },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    grow: { flex: 1 },
    row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      backgroundColor: colors.card,
      color: colors.foreground,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    chip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: typography.body, color: colors.foreground },
    chipTextOn: { color: colors.primaryForeground },
  }),
);
