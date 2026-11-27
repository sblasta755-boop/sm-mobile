import { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { MaintenancePill } from "@/components/MaintenancePill";
import { AccessView } from "@/components/maintenance/AccessView";
import { ContractorsView } from "@/components/maintenance/ContractorsView";
import { appAlert } from "@/components/Dialog";
import { formatMoney } from "@/domain/payroll";
import { fuzzyFilter } from "@/domain/fuzzySearch";
import { timeAgo } from "@/domain/platformHome";
import { useSmartClean } from "@/features/store";
import {
  MAINTENANCE_STATE_LABEL,
  attentionTiles,
  emptyMessage,
  maintenanceSeverityTone,
  maintenanceStateTone,
  nextStep,
  sortJobs,
  visibleQueues,
  type NextTone,
} from "@/domain/maintenance";
import {
  getMaintenanceMe,
  getMaintenanceSummary,
  listMaintenanceJobs,
  type MaintenanceCapabilities,
  type MaintenanceJob,
  type MaintenanceQueue,
  type MaintenanceSummary,
} from "@/api/client";
import {
  colors,
  radius,
  shadows,
  spacing,
  typography,
  themedStyles,
  useThemeVersion,
} from "@/theme";

const NEXT_ICON: Record<NextTone, keyof typeof Ionicons.glyphMap> = {
  yours: "arrow-forward-circle-outline",
  waiting: "time-outline",
  blocked: "pause-circle-outline",
  done: "checkmark-circle-outline",
};
// A function so the colours follow the theme (light, dark, an organisation's brand) when it changes.
const NEXT_COLOR = (): Record<NextTone, string> => ({
  yours: colors.primary,
  waiting: colors.mutedForeground,
  blocked: colors.destructive,
  done: colors.success,
});
const BAR_COLOR = (severity: MaintenanceJob["severity"]) =>
  ({
    critical: colors.destructive,
    high: colors.warning,
    medium: colors.info,
    low: colors.border,
  })[severity];

/** The colour at a given strength, for the tinted borders. Falls back to the colour itself for anything but #rrggbb. */
const tint = (hex: string, alpha: number) =>
  /^#[0-9a-f]{6}$/i.test(hex)
    ? `${hex}${Math.round(alpha * 255)
        .toString(16)
        .padStart(2, "0")}`
    : hex;

export default function MaintenanceListScreen() {
  useThemeVersion();
  const { state, currentUser } = useSmartClean();
  const token = state.accessToken;
  const [queue, setQueue] = useState<MaintenanceQueue>("open");
  const [jobs, setJobs] = useState<MaintenanceJob[] | null>(null);
  const [counts, setCounts] = useState<MaintenanceSummary | null>(null);
  const [caps, setCaps] = useState<MaintenanceCapabilities | undefined>(
    undefined,
  );
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"jobs" | "contractors" | "access">("jobs");

  const load = useCallback(
    async (which: MaintenanceQueue) => {
      if (!token) return;
      try {
        const [list, summary, me] = await Promise.all([
          listMaintenanceJobs(token, which),
          getMaintenanceSummary(token),
          getMaintenanceMe(token),
        ]);
        setJobs(list);
        setCounts(summary);
        setCaps(me.capabilities);
      } catch (error) {
        setJobs([]);
        appAlert(
          "Could not load jobs",
          error instanceof Error ? error.message : "Try again in a moment.",
        );
      }
    },
    [token],
  );

  // Reload whenever the screen is shown again, so a job just reported or moved is up to date.
  useFocusEffect(
    useCallback(() => {
      void load(queue);
    }, [load, queue]),
  );

  const siteName = (id: string) =>
    state.sites.find((s) => s.id === id)?.name ?? "Site";
  const placeName = (id: string | null) =>
    id ? (state.locations.find((l) => l.id === id)?.name ?? null) : null;

  const shown = useMemo(
    () =>
      sortJobs(
        fuzzyFilter(jobs ?? [], search, (j) => [
          j.title,
          j.assetLabel,
          state.sites.find((s) => s.id === j.siteId)?.name,
          j.locationId
            ? state.locations.find((l) => l.id === j.locationId)?.name
            : null,
        ]),
        caps,
      ),
    [jobs, search, caps, state.sites, state.locations],
  );

  const tiles = useMemo(() => attentionTiles(counts, caps), [counts, caps]);
  const canManageContractors =
    !!caps && (caps.handle || caps.approve || caps.pay);
  // Only administrators and operations managers choose who has access.
  const isOwner =
    currentUser?.role === "org_admin" ||
    currentUser?.role === "operations_manager";
  const pick = (q: MaintenanceQueue) => {
    setJobs(null);
    setQueue(q);
  };
  const report = () => router.push("/maintenance/new" as never);
  const empty = emptyMessage(queue);

  const tileLook = {
    bad: {
      bg: colors.destructiveSoft,
      border: tint(colors.destructive, 0.4),
      fg: colors.destructive,
    },
    warn: {
      bg: colors.warningSoft,
      border: tint(colors.warning, 0.5),
      fg: colors.warning,
    },
    info: {
      bg: colors.infoSoft,
      border: tint(colors.info, 0.4),
      fg: colors.info,
    },
  } as const;

  return (
    <Screen
      title="Maintenance"
      overlay={
        view !== "jobs" ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Report fault"
            onPress={report}
            style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
          >
            <Ionicons name="add" size={20} color={colors.primaryForeground} />
            <Text style={styles.fabText}>Report fault</Text>
          </Pressable>
        )
      }
    >
      <View style={styles.body}>
        {canManageContractors || isOwner ? (
          <View accessibilityRole="tablist" style={styles.segments}>
            {(
              [
                { id: "jobs", label: "Jobs", show: true },
                {
                  id: "contractors",
                  label: "Contractors",
                  show: canManageContractors,
                },
                { id: "access", label: "Access", show: isOwner },
              ] as const
            )
              .filter((t) => t.show)
              .map((t) => (
                <Pressable
                  key={t.id}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: view === t.id }}
                  onPress={() => setView(t.id)}
                  style={[styles.segment, view === t.id && styles.segmentOn]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      view === t.id && styles.segmentTextOn,
                    ]}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              ))}
          </View>
        ) : null}

        <Text style={styles.lead}>
          {view === "access"
            ? "Choose who can use Maintenance."
            : view === "contractors"
              ? "The people you call when something needs fixing."
              : counts && counts.open > 0
                ? `${counts.open} open ${counts.open === 1 ? "job" : "jobs"}`
                : "Faults, quotes and payments in one place."}
        </Text>

        {view === "access" && isOwner ? (
          <AccessView />
        ) : view === "contractors" && canManageContractors ? (
          <ContractorsView />
        ) : (
          <>
            {/* Money owed to contractors, first and unmissable. Only people who pay ever see it. */}
            {caps?.pay && counts && counts.payments > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${formatMoney(counts.payments_owing ?? 0)} to pay to contractors`}
                onPress={() => pick("payments")}
                style={[
                  styles.payBanner,
                  (counts.payments_overdue ?? 0) > 0 && styles.payBannerLate,
                ]}
              >
                <Ionicons
                  name="cash-outline"
                  size={24}
                  color={
                    (counts.payments_overdue ?? 0) > 0
                      ? colors.destructive
                      : colors.warning
                  }
                />
                <View style={styles.flex}>
                  <Text style={styles.payTitle}>
                    {formatMoney(counts.payments_owing ?? 0)} to pay to
                    contractors
                  </Text>
                  <Text style={styles.muted}>
                    {counts.payments}{" "}
                    {counts.payments === 1 ? "payment" : "payments"} waiting
                    {(counts.payments_overdue ?? 0) > 0
                      ? `, ${counts.payments_overdue} past the due date`
                      : ""}
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={colors.mutedForeground}
                />
              </Pressable>
            ) : null}

            {/* What needs you, before anything else. Each tile is a shortcut to that queue. */}
            {tiles.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.row}
                style={styles.bleed}
              >
                {tiles.map((tile) => (
                  <Pressable
                    key={tile.label}
                    accessibilityRole="button"
                    accessibilityLabel={`${tile.count} ${tile.label}`}
                    onPress={() => pick(tile.queue)}
                    style={[
                      styles.tile,
                      {
                        backgroundColor: tileLook[tile.tone].bg,
                        borderColor: tileLook[tile.tone].border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.tileCount,
                        { color: tileLook[tile.tone].fg },
                      ]}
                    >
                      {tile.count}
                    </Text>
                    <Text
                      style={[
                        styles.tileLabel,
                        { color: tileLook[tile.tone].fg },
                      ]}
                    >
                      {tile.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
              style={styles.bleed}
            >
              {visibleQueues(counts, queue).map((q) => (
                <Pressable
                  key={q.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: queue === q.value }}
                  onPress={() => pick(q.value)}
                  style={[styles.chip, queue === q.value && styles.chipOn]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      queue === q.value && styles.chipTextOn,
                    ]}
                  >
                    {q.label}
                  </Text>
                  {q.count !== null && q.count > 0 ? (
                    <Text
                      style={[
                        styles.chipCount,
                        queue === q.value && styles.chipTextOn,
                      ]}
                    >
                      {q.count}
                    </Text>
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>

            {(jobs?.length ?? 0) > 5 ? (
              <View style={styles.search}>
                <Ionicons
                  name="search"
                  size={16}
                  color={colors.mutedForeground}
                  style={styles.searchIcon}
                />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search by title, place or equipment"
                  placeholderTextColor={colors.mutedForeground}
                  accessibilityLabel="Search jobs"
                  style={styles.searchInput}
                />
              </View>
            ) : null}

            {jobs === null ? (
              <View style={styles.list}>
                {[0, 1, 2].map((i) => (
                  <View key={i} style={styles.skeleton} />
                ))}
              </View>
            ) : shown.length === 0 ? (
              <View style={styles.empty}>
                <View style={styles.emptyIcon}>
                  <Ionicons
                    name={search ? "search" : "checkmark-circle-outline"}
                    size={22}
                    color={colors.success}
                  />
                </View>
                <Text style={styles.emptyTitle}>
                  {search ? "No jobs match" : empty.title}
                </Text>
                <Text style={styles.emptyHint}>
                  {search
                    ? "Try different words, or clear the search."
                    : empty.hint}
                </Text>
                {!search && (queue === "open" || queue === "mine") ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={report}
                    style={styles.emptyButton}
                  >
                    <Ionicons
                      name="add"
                      size={18}
                      color={colors.primaryForeground}
                    />
                    <Text style={styles.emptyButtonText}>Report a fault</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <View style={styles.list}>
                {shown.map((job) => {
                  const step = nextStep(job, caps);
                  const place = [
                    siteName(job.siteId),
                    placeName(job.locationId),
                    job.assetLabel,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <Pressable
                      key={job.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${job.title}. ${MAINTENANCE_STATE_LABEL[job.state]}. ${step.text}`}
                      onPress={() =>
                        router.push(`/maintenance/${job.id}` as never)
                      }
                      style={({ pressed }) => [
                        styles.job,
                        step.tone === "done" && styles.jobDone,
                        pressed && styles.pressed,
                      ]}
                    >
                      <View
                        style={[
                          styles.bar,
                          { backgroundColor: BAR_COLOR(job.severity) },
                        ]}
                      />
                      <View style={styles.jobBody}>
                        <View style={styles.titleRow}>
                          <Text style={styles.title} numberOfLines={2}>
                            {job.title}
                          </Text>
                          <Text style={styles.ago}>
                            {timeAgo(job.updatedAt)}
                          </Text>
                        </View>
                        <View style={styles.placeRow}>
                          <Ionicons
                            name="location-outline"
                            size={12}
                            color={colors.mutedForeground}
                          />
                          <Text style={styles.place} numberOfLines={1}>
                            {place}
                          </Text>
                        </View>
                        {step.text ? (
                          <View style={styles.next}>
                            <Ionicons
                              name={NEXT_ICON[step.tone]}
                              size={16}
                              color={NEXT_COLOR()[step.tone]}
                              style={styles.nextIcon}
                            />
                            <Text
                              style={[
                                styles.nextText,
                                { color: NEXT_COLOR()[step.tone] },
                                step.tone === "yours" && styles.semibold,
                                step.tone === "blocked" && styles.medium,
                              ]}
                            >
                              {step.text}
                            </Text>
                          </View>
                        ) : null}
                        <View style={styles.pills}>
                          <MaintenancePill
                            label={job.severity}
                            tone={maintenanceSeverityTone(job.severity)}
                          />
                          <MaintenancePill
                            label={MAINTENANCE_STATE_LABEL[job.state]}
                            tone={maintenanceStateTone(job.state)}
                          />
                          {job.evidence.length > 0 ? (
                            <View style={styles.evidence}>
                              <Ionicons
                                name="image-outline"
                                size={14}
                                color={colors.mutedForeground}
                              />
                              <Text style={styles.muted}>
                                {job.evidence.length}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={20}
                        color={colors.mutedForeground}
                      />
                    </Pressable>
                  );
                })}
              </View>
            )}
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    // Room at the bottom so the floating button never covers the last card.
    body: { gap: spacing.lg, paddingBottom: 72 },
    flex: { flex: 1, minWidth: 0 },
    pressed: { opacity: 0.85, transform: [{ scale: 0.995 }] },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    lead: { fontSize: typography.body, color: colors.mutedForeground },
    // Rows that scroll sideways run to the screen edge, like the PWA.
    bleed: { marginHorizontal: -spacing.lg },
    row: { gap: spacing.sm, paddingHorizontal: spacing.lg },
    segments: {
      flexDirection: "row",
      gap: spacing.xs,
      padding: spacing.xs,
      borderRadius: radius.round,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    segment: {
      flex: 1,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.round,
    },
    segmentOn: { backgroundColor: colors.primary },
    segmentText: {
      fontSize: typography.body,
      fontWeight: "600",
      color: colors.mutedForeground,
    },
    segmentTextOn: { color: colors.primaryForeground },
    payBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      borderWidth: 1,
      borderColor: tint(colors.warning, 0.5),
      backgroundColor: colors.warningSoft,
      borderRadius: 16,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    payBannerLate: {
      borderColor: tint(colors.destructive, 0.4),
      backgroundColor: colors.destructiveSoft,
    },
    payTitle: {
      fontSize: typography.body,
      fontWeight: "700",
      color: colors.foreground,
    },
    tile: {
      minWidth: 120,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      borderWidth: 1,
      borderRadius: 16,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    tileCount: { fontSize: 24, fontWeight: "700", lineHeight: 24 },
    tileLabel: { fontSize: typography.small, fontWeight: "600" },
    chips: { gap: 6, paddingHorizontal: spacing.lg },
    chip: {
      height: 40,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.round,
      paddingHorizontal: spacing.lg,
      backgroundColor: colors.card,
    },
    chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: {
      fontSize: typography.body,
      fontWeight: "600",
      color: colors.foreground,
    },
    chipCount: {
      fontSize: typography.body,
      fontWeight: "600",
      color: colors.foreground,
      opacity: 0.75,
    },
    chipTextOn: { color: colors.primaryForeground },
    search: { justifyContent: "center" },
    searchIcon: { position: "absolute", left: 14, zIndex: 1 },
    searchInput: {
      height: 44,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.round,
      backgroundColor: colors.card,
      paddingLeft: 38,
      paddingRight: spacing.lg,
      fontSize: 16,
      color: colors.foreground,
    },
    list: { gap: 10 },
    skeleton: { height: 112, borderRadius: 16, backgroundColor: colors.muted },
    job: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      backgroundColor: colors.card,
      padding: spacing.lg,
      paddingLeft: 20,
      ...shadows.card,
    },
    jobDone: { opacity: 0.75 },
    bar: { position: "absolute", top: 0, bottom: 0, left: 0, width: 6 },
    jobBody: { flex: 1, minWidth: 0, gap: 6 },
    titleRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: spacing.md,
    },
    title: {
      flex: 1,
      fontSize: 16,
      fontWeight: "600",
      lineHeight: 21,
      color: colors.foreground,
    },
    ago: {
      paddingTop: 2,
      fontSize: typography.small,
      color: colors.mutedForeground,
    },
    placeRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    place: {
      flex: 1,
      fontSize: typography.small,
      color: colors.mutedForeground,
    },
    next: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
    nextIcon: { marginTop: 2 },
    nextText: { flex: 1, fontSize: typography.body },
    semibold: { fontWeight: "600" },
    medium: { fontWeight: "500" },
    pills: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 6,
      paddingTop: 2,
    },
    evidence: { flexDirection: "row", alignItems: "center", gap: 4 },
    empty: {
      alignItems: "center",
      gap: 4,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: colors.border,
      borderRadius: 16,
      paddingHorizontal: spacing.xl,
      paddingVertical: 56,
    },
    emptyIcon: {
      width: 48,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.round,
      backgroundColor: colors.successSoft,
      marginBottom: spacing.sm,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.foreground,
      textAlign: "center",
    },
    emptyHint: {
      fontSize: typography.body,
      color: colors.mutedForeground,
      textAlign: "center",
    },
    emptyButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginTop: spacing.md,
      height: 44,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.round,
      backgroundColor: colors.primary,
    },
    emptyButtonText: {
      fontSize: typography.body,
      fontWeight: "600",
      color: colors.primaryForeground,
    },
    fab: {
      height: 56,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingHorizontal: 20,
      borderRadius: radius.round,
      backgroundColor: colors.primary,
      ...shadows.raised,
    },
    fabText: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.primaryForeground,
    },
  }),
);
