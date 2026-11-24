import { useCallback, useEffect, useMemo, useState } from "react";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { StatusBadge } from "@/components/StatusBadge";
import { appAlert } from "@/components/Dialog";
import {
  ApiError,
  cancelTournament,
  getTournament,
  getTournamentRights,
  removeTournamentEntrant,
  setTournamentRegistration,
  setTournamentWinner,
  startTournament,
  type TournamentMatch,
  type TournamentView,
} from "@/api/client";
import {
  FORMAT_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  canPick,
  matchesByRound,
  roundName,
  startsLabel,
} from "@/domain/tournament";
import { useSmartClean } from "@/features/store";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

/** One tournament: players, registration controls, and the bracket where the winner of each match is recorded. */
export default function TournamentDetailScreen() {
  useThemeVersion();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useSmartClean();
  const token = state.accessToken;
  const [view, setView] = useState<TournamentView | null>(null);
  const [canRun, setCanRun] = useState(false);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token || !id) return;
    try {
      setView(await getTournament(token, id));
    } catch (e) {
      appAlert("Could not load the tournament", e instanceof Error ? e.message : undefined);
    }
  }, [token, id]);

  useFocusEffect(
    useCallback(() => {
      void load();
      if (token) getTournamentRights(token).then((r) => setCanRun(r.canRun)).catch(() => undefined);
    }, [load, token]),
  );

  const live = view?.status === "registration" || view?.status === "closed" || view?.status === "running";
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => void load(), 15_000);
    return () => clearInterval(timer);
  }, [live, load]);

  const entrants = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (view?.entrants ?? []).filter(
      (p) => !q || p.name.toLowerCase().includes(q) || p.username.toLowerCase().includes(q),
    );
  }, [view, filter]);

  if (!view || !token) {
    return (
      <Screen title="Tournament" backTo="/tournaments">
        <Text style={styles.muted}>Loading...</Text>
      </Screen>
    );
  }

  const name = (pid: string | null) => (pid ? (view.players[pid]?.name ?? "Player") : "");
  const act = async (fn: () => Promise<TournamentView>) => {
    setBusy(true);
    try {
      setView(await fn());
    } catch (e) {
      appAlert("Something went wrong", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };
  const ask = (title: string, message: string, label: string, run: () => void, destructive = false) =>
    appAlert(title, message, [
      { text: "Not now", style: "cancel" },
      { text: label, style: destructive ? "destructive" : "default", onPress: run },
    ]);

  const record = (m: TournamentMatch, pid: string, confirm = false) => {
    const send = async () => {
      setBusy(true);
      try {
        setView(await setTournamentWinner(token, view.id, m.round, m.position, pid, confirm));
      } catch (e) {
        if (e instanceof ApiError && e.detail?.needsConfirm && !confirm) {
          const n = (e.detail.affected as unknown[] | undefined)?.length ?? 0;
          ask(
            "This undoes later results",
            `${n} later ${n === 1 ? "match was" : "matches were"} decided from this result. Changing it clears ${n === 1 ? "it" : "them"} so they can be played again.`,
            "Change and clear",
            () => record(m, pid, true),
            true,
          );
        } else {
          appAlert("Could not record the result", e instanceof Error ? e.message : undefined);
        }
      } finally {
        setBusy(false);
      }
    };
    if (confirm) return void send();
    ask(
      m.winner ? "Change the winner?" : "Record the winner?",
      m.winner ? `${name(pid)} replaces ${name(m.winner)} as the winner.` : `${name(pid)} wins this match.`,
      m.winner ? "Change winner" : "Record winner",
      () => void send(),
    );
  };

  const beforeStart = view.status === "draft" || view.status === "registration" || view.status === "closed";
  const rounds = matchesByRound(view.matches);

  return (
    <Screen title={view.name} backTo="/tournaments">
      <View style={styles.stack}>
        <Card>
          <View style={styles.row}>
            <Text style={styles.muted}>
              {FORMAT_LABEL[view.format]} · {view.siteName}
            </Text>
            <StatusBadge tone={STATUS_TONE[view.status]} label={STATUS_LABEL[view.status]} />
          </View>
          <Text style={styles.muted}>{startsLabel(view.startsAt)}</Text>
          <Text style={styles.muted}>
            {view.tables.map((t) => t.name).join(", ") || "No tables"}
          </Text>
        </Card>

        {canRun && (beforeStart || view.status === "running") && (
          <View style={styles.stack}>
            {view.status === "registration" && (
              <Button
                variant="outline"
                disabled={busy}
                onPress={() => act(() => setTournamentRegistration(token, view.id, false))}
              >
                Close registration
              </Button>
            )}
            {(view.status === "closed" || view.status === "draft") && (
              <Button
                variant="outline"
                disabled={busy}
                onPress={() => act(() => setTournamentRegistration(token, view.id, true))}
              >
                Open registration
              </Button>
            )}
            {beforeStart && (
              <Button
                disabled={busy || view.entrantCount < 2}
                icon={<Ionicons name="play" size={18} color={colors.primaryForeground} />}
                onPress={() =>
                  ask(
                    "Start the tournament?",
                    `Registration closes and the draw is made at random for ${view.entrantCount} players.`,
                    "Start",
                    () => void act(() => startTournament(token, view.id)),
                  )
                }
              >
                Start tournament
              </Button>
            )}
            <Button
              variant="ghost"
              disabled={busy}
              onPress={() =>
                ask(
                  "Cancel this tournament?",
                  "Its tables are released and the QR codes return to normal.",
                  "Cancel tournament",
                  () => void act(() => cancelTournament(token, view.id)),
                  true,
                )
              }
            >
              Cancel tournament
            </Button>
          </View>
        )}

        {rounds.length > 0 && (
          <View style={styles.stack}>
            <Text style={styles.heading}>Bracket</Text>
            {canRun && view.status === "running" && (
              <Text style={styles.muted}>Tap a player to record them as the winner.</Text>
            )}
            {rounds.map((round, i) => (
              <View key={i} style={styles.stack}>
                <Text style={styles.round}>
                  {view.format === "single_elim" ? roundName(i + 1, view.rounds) : `Round ${i + 1}`}
                </Text>
                {round.map((m) => (
                  <Card key={`${m.round}.${m.position}`} padded={false}>
                    {[m.a, m.b].map((pid, k) => {
                      const won = pid !== null && m.winner === pid;
                      const pickable = canRun && !!pid && canPick(m) && (view.status === "running" || view.status === "completed");
                      const label = pid ? name(pid) : m.status === "bye" ? "Bye" : "To be decided";
                      return (
                        <Pressable
                          key={k}
                          disabled={!pickable || busy}
                          accessibilityRole={pickable ? "button" : undefined}
                          accessibilityLabel={pickable ? `${label} wins` : undefined}
                          onPress={() => pid && record(m, pid)}
                          style={[styles.player, k === 0 && styles.playerDivider, won && styles.playerWon]}
                        >
                          <Text style={[styles.title, !pid && styles.muted, won && { fontWeight: "700" }]} numberOfLines={1}>
                            {label}
                          </Text>
                          {won && <Ionicons name="trophy" size={16} color={colors.primary} />}
                        </Pressable>
                      );
                    })}
                  </Card>
                ))}
              </View>
            ))}
          </View>
        )}

        {view.standings.length > 0 && view.format === "round_robin" && (
          <View style={styles.stack}>
            <Text style={styles.heading}>Standings</Text>
            {view.standings.map((s) => (
              <Card key={s.playerId}>
                <View style={styles.row}>
                  <Text style={styles.title}>
                    {s.placement}. {name(s.playerId)}
                  </Text>
                  <Text style={styles.muted}>
                    {s.wins}W {s.losses}L · {s.points} pts
                  </Text>
                </View>
              </Card>
            ))}
          </View>
        )}

        <View style={styles.stack}>
          <Text style={styles.heading}>
            Players ({view.entrantCount}
            {view.maxPlayers ? ` of ${view.maxPlayers}` : ""})
          </Text>
          {view.entrants.length > 6 && (
            <TextInput
              value={filter}
              onChangeText={setFilter}
              placeholder="Search players"
              placeholderTextColor={colors.mutedForeground}
              style={styles.search}
              accessibilityLabel="Search players"
            />
          )}
          {entrants.length === 0 ? (
            <Card>
              <Text style={styles.muted}>
                {view.entrantCount === 0
                  ? "Nobody has registered yet. Players scan the QR code on a tournament table."
                  : "No player matches that search."}
              </Text>
            </Card>
          ) : (
            entrants.map((p) => (
              <Card key={p.id}>
                <View style={styles.row}>
                  <Text style={[styles.title, styles.grow]} numberOfLines={1}>
                    {p.seed ? `#${p.seed}  ` : ""}
                    {p.name} <Text style={styles.muted}>@{p.username}</Text>
                  </Text>
                  {canRun && beforeStart && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${p.name}`}
                      hitSlop={10}
                      onPress={() =>
                        ask("Remove this player?", `${p.name} will be taken off the entry list.`, "Remove", () =>
                          void act(() => removeTournamentEntrant(token, view.id, p.id)), true)
                      }
                    >
                      <Ionicons name="trash-outline" size={18} color={colors.destructive} />
                    </Pressable>
                  )}
                </View>
              </Card>
            ))
          )}
        </View>
      </View>
    </Screen>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    stack: { gap: spacing.md },
    row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
    grow: { flex: 1 },
    heading: { fontSize: typography.body, color: colors.foreground, fontWeight: "700" },
    round: { fontSize: typography.small, color: colors.mutedForeground, textTransform: "uppercase", fontWeight: "700" },
    title: { fontSize: typography.body, color: colors.foreground, flexShrink: 1 },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    player: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      minHeight: 44,
    },
    playerDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
    playerWon: { backgroundColor: colors.secondary },
    search: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      backgroundColor: colors.card,
      color: colors.foreground,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
  }),
);
