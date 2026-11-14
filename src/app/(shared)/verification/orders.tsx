import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Path } from "react-native-svg";
import { Screen } from "@/components/Screen";
import {
  fileUrl,
  listVerificationRuns,
  thumbUrl,
  type VerificationRunAnswer,
  type VerificationRunRecord,
} from "@/api/client";
import { friendlyWhen } from "@/domain/verification";
import { ORDERS_RANGES, answerLine, ordersRange, type OrdersRange } from "@/domain/verificationOrders";
import { useSmartClean } from "@/features/store";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

const THUMBS = 3;

const photosOf = (run: VerificationRunRecord) => run.answers.flatMap((a) => a.filePaths ?? []);

/** The orders this person verified, newest first, so a later query can be answered from the phone. */
export default function VerificationOrdersScreen() {
  useThemeVersion();
  const { state } = useSmartClean();
  const token = state.accessToken;
  const [range, setRange] = useState<OrdersRange>("week");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [runs, setRuns] = useState<VerificationRunRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(() => {
    if (!token) return;
    const [startDate, endDate] = ordersRange(range);
    setError(null);
    listVerificationRuns(token, { startDate, endDate, q: search })
      .then((out) => setRuns(out.runs))
      .catch((e) => {
        setRuns([]);
        setError(e instanceof Error ? e.message : "Check your connection and try again.");
      });
  }, [token, range, search]);
  useEffect(() => {
    setRuns(null);
    load();
  }, [load]);

  const shown = useMemo(() => runs ?? [], [runs]);

  return (
    <Screen title="My verified orders">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {ORDERS_RANGES.map((r) => (
          <Pressable
            key={r.key}
            accessibilityRole="button"
            accessibilityState={{ selected: range === r.key }}
            onPress={() => setRange(r.key)}
            style={[styles.chip, range === r.key && styles.chipOn]}
          >
            <Text style={[styles.chipText, range === r.key && styles.chipTextOn]}>{r.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.mutedForeground} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search order number"
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="characters"
          autoCorrect={false}
          style={styles.search}
        />
      </View>

      <Text style={styles.count} accessibilityLiveRegion="polite">
        {runs === null ? "Loading…" : `${shown.length} order${shown.length === 1 ? "" : "s"}`}
      </Text>

      {runs === null ? (
        <ActivityIndicator color={colors.primary} />
      ) : error ? (
        <View style={styles.card}>
          <Text style={styles.title}>Could not load your orders</Text>
          <Text style={styles.muted}>{error}</Text>
        </View>
      ) : shown.length === 0 ? (
        <View style={[styles.card, styles.empty]}>
          <Ionicons name="clipboard-outline" size={34} color={colors.mutedForeground} />
          <Text style={styles.title}>Nothing verified in this period</Text>
          <Text style={styles.muted}>{range === "today" ? "Try 7 days or 30 days." : "Change the period or clear the search."}</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {shown.map((run) => {
            const open = openId === run.id;
            const photos = photosOf(run);
            const extra = photos.length - THUMBS;
            const signed = run.answers.some((a) => a.signoff);
            return (
              <View key={run.id} style={styles.card}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Order ${run.reference ?? "without a number"}`}
                  accessibilityState={{ expanded: open }}
                  onPress={() => setOpenId(open ? null : run.id)}
                  style={({ pressed }) => pressed && styles.pressed}
                >
                  <View style={styles.head}>
                    <View style={styles.tick}>
                      <Ionicons name="checkmark-circle" size={22} color={colors.success} />
                    </View>
                    <View style={styles.headText}>
                      <Text style={styles.ref} numberOfLines={1}>
                        {run.reference ?? "No order number"}
                      </Text>
                      <Text style={styles.muted}>{friendlyWhen(run.submittedAt)}</Text>
                      <Text style={styles.muted} numberOfLines={1}>
                        {run.workflowName}
                      </Text>
                    </View>
                    <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.mutedForeground} />
                  </View>

                  {!open && photos.length > 0 && (
                    <View style={styles.strip}>
                      {photos.slice(0, THUMBS).map((path) => (
                        <Image key={path} source={{ uri: thumbUrl(path, 160) }} style={styles.thumb} />
                      ))}
                      {extra > 0 && (
                        <View style={[styles.thumb, styles.more]}>
                          <Text style={styles.moreText}>+{extra}</Text>
                        </View>
                      )}
                    </View>
                  )}

                  <View style={styles.tags}>
                    <Tag>{photos.length === 1 ? "1 photo" : `${photos.length} photos`}</Tag>
                    {signed && <Tag>Signed</Tag>}
                    {run.siteName ? <Tag>{run.siteName}</Tag> : null}
                  </View>
                </Pressable>

                {open && (
                  <View style={styles.detail}>
                    {run.answers.map((a) => (
                      <View key={a.stepId} style={styles.answer}>
                        <Text style={styles.answerLabel}>{a.label}</Text>
                        <AnswerBody answer={a} />
                      </View>
                    ))}
                    <Text style={styles.muted}>Print a report for this order from the web app.</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

function AnswerBody({ answer }: { answer: VerificationRunAnswer }) {
  if (answer.filePaths) {
    return (
      <View style={styles.photos}>
        {answer.filePaths.map((path) => (
          <Image key={path} source={{ uri: fileUrl(path) }} style={styles.photoBig} />
        ))}
      </View>
    );
  }
  const sign = answer.signoff;
  if (sign?.path && sign.width && sign.height) {
    return (
      <View style={styles.signBox}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${sign.width} ${sign.height}`}>
          <Path d={sign.path} stroke={colors.foreground} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
        <Text style={styles.answerValue}>{sign.name ?? "Signed"}</Text>
      </View>
    );
  }
  return <Text style={styles.answerValue}>{answerLine(answer)}</Text>;
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.tag}>
      <Text style={styles.tagText}>{children}</Text>
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    chips: { flexDirection: "row", gap: spacing.sm, paddingBottom: spacing.sm },
    chip: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.round,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: typography.small, fontWeight: "600", color: colors.mutedForeground },
    chipTextOn: { color: colors.primaryForeground },
    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.card,
      marginBottom: spacing.sm,
    },
    search: { flex: 1, paddingVertical: spacing.sm, fontSize: typography.body, color: colors.foreground },
    count: { fontSize: typography.small, fontWeight: "700", color: colors.foreground, marginBottom: spacing.sm },
    list: { gap: spacing.sm },
    card: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.xl,
      backgroundColor: colors.card,
      padding: spacing.md,
      gap: spacing.xs,
    },
    pressed: { opacity: 0.85 },
    empty: { alignItems: "center", paddingVertical: spacing.xl },
    head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    tick: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.successSoft, alignItems: "center", justifyContent: "center" },
    headText: { flex: 1 },
    ref: { fontSize: typography.body, fontWeight: "800", color: colors.foreground },
    title: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    strip: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
    thumb: { width: 56, height: 56, borderRadius: radius.md },
    more: { backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" },
    moreText: { fontSize: typography.small, fontWeight: "700", color: colors.mutedForeground },
    tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: spacing.sm },
    tag: { backgroundColor: colors.muted, borderRadius: radius.round, paddingHorizontal: 8, paddingVertical: 2 },
    tagText: { fontSize: typography.tiny, fontWeight: "600", color: colors.mutedForeground },
    detail: { marginTop: spacing.sm, gap: spacing.sm },
    answer: { gap: 2 },
    answerLabel: { fontSize: typography.tiny, fontWeight: "700", color: colors.mutedForeground, textTransform: "uppercase" },
    answerValue: { fontSize: typography.small, color: colors.foreground },
    photos: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
    photoBig: { width: 110, height: 82, borderRadius: radius.md },
    signBox: { height: 100, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.xs },
  }),
);
