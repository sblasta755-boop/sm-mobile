import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { StatusBadge } from "@/components/StatusBadge";
import { appAlert } from "@/components/Dialog";
import {
  decideOvertime,
  listOvertime,
  type OvertimeRequest,
} from "@/api/client";
import { useSmartClean } from "@/features/store";
import {
  colors,
  radius,
  spacing,
  typography,
  themedStyles,
  useThemeVersion,
} from "@/theme";

const TONE: Record<
  OvertimeRequest["status"],
  "warning" | "success" | "destructive" | "neutral"
> = {
  awaiting_approval: "warning",
  approved: "success",
  declined: "destructive",
  expired: "neutral",
  cancelled: "neutral",
};
const LABEL: Record<OvertimeRequest["status"], string> = {
  awaiting_approval: "Waiting",
  approved: "Approved",
  declined: "Declined",
  expired: "Lapsed",
  cancelled: "Withdrawn",
};

/** Overtime asked for by staff still on site past shift end. A supervisor decides for field staff,
 * a site manager for a supervisor. */
const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
  });
const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";
const waitingFor = (iso: string) => {
  const minutes = Math.max(
    0,
    Math.round((Date.now() - new Date(iso).getTime()) / 60000),
  );
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} h` : `${Math.round(hours / 24)} days`;
};
// One tap fills the reason, so declining is as quick as approving.
const QUICK_REASONS = [
  "Not needed",
  "The shift had already ended",
  "Not authorised in advance",
];
type HistoryFilter = "all" | "approved" | "declined" | "other";

/** Overtime asked for by staff still on site past shift end. A supervisor decides for field staff,
 * a site manager for a supervisor. */
export default function OvertimeScreen() {
  useThemeVersion();
  const { state } = useSmartClean();
  const token = state.accessToken;
  const [tab, setTab] = useState<"pending" | "history">("pending");
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [waiting, setWaiting] = useState<OvertimeRequest[] | null>(null);
  const [history, setHistory] = useState<OvertimeRequest[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [declining, setDeclining] = useState<OvertimeRequest | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(() => {
    if (!token) return;
    listOvertime(token, "pending")
      .then(setWaiting)
      .catch(() => setWaiting([]));
    listOvertime(token, "history")
      .then((rows) =>
        setHistory(rows.filter((r) => r.status !== "awaiting_approval")),
      )
      .catch(() => setHistory([]));
  }, [token]);
  useFocusEffect(load);

  const decide = async (
    row: OvertimeRequest,
    approve: boolean,
    reason?: string,
  ) => {
    if (!token) return;
    setBusyId(row.id);
    try {
      await decideOvertime(token, row.id, approve, reason);
      appAlert(
        approve
          ? `Approved for ${row.userName}`
          : `Declined for ${row.userName}`,
        undefined,
        undefined,
        "success",
      );
      load();
    } catch (error) {
      appAlert(
        "Could not do that",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const approveAll = () => {
    const rows = waiting ?? [];
    if (rows.length < 2 || !token) return;
    appAlert(
      `Approve all ${rows.length} requests?`,
      "Everyone's time past shift end will count. You can't undo this.",
      [
        { text: "Cancel" },
        {
          text: "Approve all",
          onPress: async () => {
            setBusyId("all");
            let done = 0;
            for (const row of rows) {
              try {
                await decideOvertime(token, row.id, true);
                done += 1;
              } catch {
                /* the rest still go through; the count below says how many did */
              }
            }
            setBusyId(null);
            appAlert(
              done === rows.length
                ? `Approved ${done} requests`
                : `Approved ${done} of ${rows.length}`,
              done === rows.length ? undefined : "Try the rest one by one.",
            );
            load();
          },
        },
      ],
    );
  };

  const shownHistory = history.filter(
    (r) =>
      filter === "all" ||
      (filter === "approved" && r.status === "approved") ||
      (filter === "declined" && r.status === "declined") ||
      (filter === "other" &&
        (r.status === "expired" || r.status === "cancelled")),
  );
  const count = waiting?.length ?? 0;

  return (
    <Screen title="Overtime">
      <View style={styles.info}>
        <Ionicons
          name="information-circle-outline"
          size={20}
          color={colors.mutedForeground}
        />
        <Text style={[styles.muted, styles.flex]}>
          Staff still on site after their shift ask here. Approved time is
          counted. Declined or unanswered time is cut back to the end of the
          shift.
        </Text>
      </View>

      <View style={styles.tabs} accessibilityRole="tablist">
        {(
          [
            ["pending", "Waiting for me"],
            ["history", "History"],
          ] as const
        ).map(([value, label]) => (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === value }}
            onPress={() => setTab(value)}
            style={[styles.tab, tab === value && styles.tabOn]}
          >
            <Text style={[styles.tabText, tab === value && styles.tabTextOn]}>
              {label}
              {value === "pending" && count > 0 ? `  ${count}` : ""}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === "pending" ? (
        <View style={styles.section}>
          {count > 1 && (
            <Button
              variant="outline"
              disabled={busyId !== null}
              onPress={approveAll}
            >
              Approve all {count}
            </Button>
          )}
          {waiting === null && <Text style={styles.muted}>Loading…</Text>}
          {waiting?.length === 0 && (
            <View style={styles.empty}>
              <Ionicons
                name="checkmark-circle-outline"
                size={36}
                color={colors.mutedForeground}
              />
              <Text style={styles.title}>All caught up</Text>
              <Text style={[styles.muted, styles.center]}>
                Nobody is waiting on you. When staff stay past shift end, their
                request appears here.
              </Text>
            </View>
          )}
          {waiting?.map((row) => {
            const late = Math.max(
              0,
              Math.round(
                (new Date(row.requestedAt).getTime() -
                  new Date(row.shiftEndAt).getTime()) /
                  60000,
              ),
            );
            return (
              <Card key={row.id} style={styles.card}>
                <View style={styles.person}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {initialsOf(row.userName)}
                    </Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.title}>{row.userName}</Text>
                    <Text style={styles.muted}>
                      Shift ended {clock(row.shiftEndAt)} · asked at{" "}
                      {clock(row.requestedAt)}
                      {late > 0 ? ` (${late} min after)` : ""}
                    </Text>
                  </View>
                </View>
                <Text style={styles.muted}>
                  Waiting {waitingFor(row.requestedAt)}
                </Text>
                <Text style={styles.quote}>
                  {row.reason ? `“${row.reason}”` : "No reason given."}
                </Text>
                <View style={styles.pair}>
                  <Button
                    fullWidth={false}
                    variant="outline"
                    disabled={busyId !== null}
                    onPress={() => {
                      setNote("");
                      setDeclining(row);
                    }}
                  >
                    Decline
                  </Button>
                  <Button
                    fullWidth={false}
                    disabled={busyId !== null}
                    onPress={() => decide(row, true)}
                  >
                    Approve
                  </Button>
                </View>
                <Text style={styles.tiny}>
                  Approve and the time counts. Decline and it is cut back to
                  shift end.
                </Text>
              </Card>
            );
          })}
        </View>
      ) : (
        <View style={styles.section}>
          {history.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons
                name="time-outline"
                size={36}
                color={colors.mutedForeground}
              />
              <Text style={styles.title}>No decisions yet</Text>
              <Text style={[styles.muted, styles.center]}>
                Requests you approve or decline are kept here.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.chips}>
                {(
                  [
                    ["all", "All"],
                    ["approved", "Approved"],
                    ["declined", "Declined"],
                    ["other", "Lapsed or withdrawn"],
                  ] as const
                ).map(([value, label]) => (
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityState={{ selected: filter === value }}
                    onPress={() => setFilter(value)}
                    style={[styles.chip, filter === value && styles.chipOn]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        filter === value && styles.chipTextOn,
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {shownHistory.length === 0 && (
                <Text style={styles.muted}>Nothing in this group.</Text>
              )}
              {shownHistory.map((row) => (
                <Card key={row.id} style={styles.card}>
                  <View style={styles.row}>
                    <View style={styles.person}>
                      <View style={styles.avatarSmall}>
                        <Text style={styles.avatarText}>
                          {initialsOf(row.userName)}
                        </Text>
                      </View>
                      <Text style={styles.title}>{row.userName}</Text>
                    </View>
                    <StatusBadge
                      tone={TONE[row.status]}
                      label={LABEL[row.status]}
                    />
                  </View>
                  <Text style={styles.muted}>
                    Shift ended {clock(row.shiftEndAt)}
                    {row.decidedAt
                      ? ` · decided ${new Date(row.decidedAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}`
                      : ""}
                  </Text>
                  {!!row.reason && (
                    <Text style={styles.quote}>“{row.reason}”</Text>
                  )}
                  {!!row.decisionNote && (
                    <Text style={styles.muted}>{row.decisionNote}</Text>
                  )}
                </Card>
              ))}
            </>
          )}
        </View>
      )}

      <Modal
        visible={declining !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDeclining(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setDeclining(null)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <Text style={styles.heading}>Decline overtime</Text>
            <Text style={styles.muted}>
              {declining?.userName}'s hours will end at shift end. Say why, so
              they know.
            </Text>
            <View style={styles.chips}>
              {QUICK_REASONS.map((r) => (
                <Pressable
                  key={r}
                  accessibilityRole="button"
                  onPress={() => setNote(r)}
                  style={[styles.chip, note === r && styles.chipOn]}
                >
                  <Text
                    style={[styles.chipText, note === r && styles.chipTextOn]}
                  >
                    {r}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={note}
              onChangeText={setNote}
              multiline
              placeholder="Reason"
              placeholderTextColor={colors.mutedForeground}
            />
            <View style={styles.pair}>
              <Button
                fullWidth={false}
                variant="outline"
                onPress={() => setDeclining(null)}
              >
                Close
              </Button>
              <Button
                fullWidth={false}
                disabled={!note.trim() || busyId === declining?.id}
                onPress={async () => {
                  const target = declining;
                  if (!target) return;
                  setDeclining(null);
                  await decide(target, false, note.trim());
                }}
              >
                Decline
              </Button>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    section: { marginTop: spacing.lg, gap: spacing.sm },
    heading: {
      fontSize: typography.h2,
      fontWeight: "700",
      color: colors.foreground,
    },
    card: { gap: spacing.xs },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
    },
    title: {
      fontSize: typography.body,
      fontWeight: "700",
      color: colors.foreground,
    },
    body: { fontSize: typography.body, color: colors.foreground },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    tiny: { fontSize: typography.tiny, color: colors.mutedForeground },
    flex: { flex: 1, minWidth: 0 },
    center: { textAlign: "center" },
    info: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      borderRadius: radius.xl,
      padding: spacing.md,
    },
    tabs: {
      flexDirection: "row",
      backgroundColor: colors.muted,
      borderRadius: radius.xl,
      padding: 4,
      marginTop: spacing.md,
    },
    tab: {
      flex: 1,
      minHeight: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.lg,
    },
    tabOn: { backgroundColor: colors.background },
    tabText: {
      fontSize: typography.small,
      fontWeight: "700",
      color: colors.mutedForeground,
    },
    tabTextOn: { color: colors.foreground },
    empty: {
      alignItems: "center",
      gap: spacing.xs,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: colors.border,
      borderRadius: radius.xl,
      padding: spacing.xl,
    },
    person: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      flexShrink: 1,
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.muted,
    },
    avatarSmall: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.muted,
    },
    avatarText: {
      fontSize: typography.small,
      fontWeight: "800",
      color: colors.mutedForeground,
    },
    quote: {
      fontSize: typography.body,
      color: colors.foreground,
      backgroundColor: colors.muted,
      borderRadius: radius.md,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
    chip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: spacing.md,
      minHeight: 34,
      justifyContent: "center",
      backgroundColor: colors.card,
    },
    chipOn: { backgroundColor: colors.muted, borderColor: colors.foreground },
    chipText: {
      fontSize: typography.small,
      fontWeight: "600",
      color: colors.mutedForeground,
    },
    chipTextOn: { color: colors.foreground },
    pair: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
    backdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: "flex-start",
      padding: spacing.xl,
      paddingTop: spacing.xxl * 2,
    },
    sheet: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      color: colors.foreground,
      backgroundColor: colors.card,
      fontSize: 16,
      minHeight: 44,
    },
    multiline: { minHeight: 90, textAlignVertical: "top" },
  }),
);
