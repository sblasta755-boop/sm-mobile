import { useCallback, useMemo, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { StatusBadge } from "@/components/StatusBadge";
import { appAlert } from "@/components/Dialog";
import {
  getTournamentLeaderboard,
  getTournamentRights,
  listTournaments,
  type TournamentLeaderboardEntry,
  type TournamentSummary,
} from "@/api/client";
import { FORMAT_LABEL, STATUS_LABEL, STATUS_TONE, startsLabel } from "@/domain/tournament";
import { useHomePath } from "@/features/roles";
import { useSmartClean } from "@/features/store";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

type Tab = "list" | "leaderboard";

/** Pool-table tournaments: the list, the leaderboard, and (for people allowed to run them) a way to start one. */
export default function TournamentsScreen() {
  useThemeVersion();
  const homePath = useHomePath();
  const { state } = useSmartClean();
  const token = state.accessToken;
  const [tab, setTab] = useState<Tab>("list");
  const [items, setItems] = useState<TournamentSummary[] | null>(null);
  const [board, setBoard] = useState<TournamentLeaderboardEntry[] | null>(null);
  const [canRun, setCanRun] = useState(false);
  const [query, setQuery] = useState("");

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      let live = true;
      Promise.all([listTournaments(token), getTournamentRights(token), getTournamentLeaderboard(token, "all")])
        .then(([list, rights, lb]) => {
          if (!live) return;
          setItems(list);
          setCanRun(rights.canRun);
          setBoard(lb.entries);
        })
        .catch((e) => {
          if (live) setItems([]);
          appAlert("Could not load tournaments", e instanceof Error ? e.message : undefined);
        });
      return () => {
        live = false;
      };
    }, [token]),
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? []).filter((t) => !q || t.name.toLowerCase().includes(q));
  }, [items, query]);

  return (
    <Screen title="Tournaments" backTo={homePath}>
      <View style={styles.tabs}>
        {(["list", "leaderboard"] as const).map((t) => (
          <Pressable
            key={t}
            accessibilityRole="button"
            onPress={() => setTab(t)}
            style={[styles.tab, tab === t && styles.tabOn]}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>
              {t === "list" ? "Tournaments" : "Leaderboard"}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === "list" ? (
        <View style={styles.stack}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search tournaments"
            placeholderTextColor={colors.mutedForeground}
            style={styles.search}
            accessibilityLabel="Search tournaments"
          />
          {canRun && (
            <Button
              icon={<Ionicons name="add" size={18} color={colors.primaryForeground} />}
              onPress={() => router.push("/tournaments/new" as never)}
            >
              New tournament
            </Button>
          )}
          {items === null ? (
            <Text style={styles.muted}>Loading...</Text>
          ) : shown.length === 0 ? (
            <Card>
              <Text style={styles.muted}>
                {items.length === 0 ? "No tournaments yet." : "No tournament matches that search."}
              </Text>
            </Card>
          ) : (
            shown.map((t) => (
              <Pressable
                key={t.id}
                accessibilityRole="button"
                onPress={() => router.push(`/tournaments/${t.id}` as never)}
              >
                <Card>
                  <View style={styles.row}>
                    <Text style={styles.title} numberOfLines={1}>
                      {t.name}
                    </Text>
                    <StatusBadge tone={STATUS_TONE[t.status]} label={STATUS_LABEL[t.status]} />
                  </View>
                  <Text style={styles.muted}>
                    {FORMAT_LABEL[t.format]} · {t.tableCount} {t.tableCount === 1 ? "table" : "tables"} ·{" "}
                    {t.entrantCount}
                    {t.maxPlayers ? ` of ${t.maxPlayers}` : ""} players
                  </Text>
                  <Text style={styles.muted}>{startsLabel(t.startsAt)}</Text>
                </Card>
              </Pressable>
            ))
          )}
        </View>
      ) : (
        <View style={styles.stack}>
          {board === null ? (
            <Text style={styles.muted}>Loading...</Text>
          ) : board.length === 0 ? (
            <Card>
              <Text style={styles.muted}>No finished tournaments yet.</Text>
            </Card>
          ) : (
            board.map((e) => (
              <Card key={e.playerId}>
                <View style={styles.row}>
                  <Text style={styles.rank}>{e.rank}</Text>
                  <View style={styles.grow}>
                    <Text style={styles.title} numberOfLines={1}>
                      {e.name}
                    </Text>
                    <Text style={styles.muted}>
                      @{e.username} · {e.wins} wins from {e.played} · {Math.round(e.winRate * 100)}%
                      {e.titles > 0 ? ` · ${e.titles} ${e.titles === 1 ? "title" : "titles"}` : ""}
                    </Text>
                  </View>
                  <Text style={styles.points}>{e.points}</Text>
                </View>
              </Card>
            ))
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    stack: { gap: spacing.md },
    tabs: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
    tab: {
      flex: 1,
      paddingVertical: spacing.sm,
      alignItems: "center",
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    tabOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    tabText: { fontSize: typography.body, color: colors.foreground },
    tabTextOn: { color: colors.primaryForeground },
    search: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      backgroundColor: colors.card,
      color: colors.foreground,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
    grow: { flex: 1 },
    title: { fontSize: typography.body, color: colors.foreground, fontWeight: "600", flexShrink: 1 },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    rank: { fontSize: typography.body, color: colors.mutedForeground, width: 28, fontWeight: "700" },
    points: { fontSize: typography.body, color: colors.foreground, fontWeight: "700" },
  }),
);
