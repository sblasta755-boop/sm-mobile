import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { appAlert } from "@/components/Dialog";
import { useSmartClean } from "@/features/store";
import {
  fileUrl,
  listPlatformFeedback,
  updatePlatformFeedback,
  type FeedbackStatus,
  type PlatformFeedback,
  type PlatformFeedbackCounts,
} from "@/api/client";
import { FEEDBACK_CATEGORIES, categoryLabel, initialsOf, neighbour, preview, replyLink } from "@/domain/feedbackInbox";
import { timeAgo } from "@/domain/platformHome";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

type View_ = "open" | "new" | "starred" | "resolved" | "all";

const EMPTY: PlatformFeedbackCounts = {
  open: 0,
  new: 0,
  seen: 0,
  resolved: 0,
  starred: 0,
  thisWeek: 0,
  openByCategory: { bug: 0, idea: 0, question: 0, other: 0 },
};

const queryFor = (view: View_) =>
  view === "open" ? { status: "open" as const } : view === "new" ? { status: "new" as const } : view === "resolved" ? { status: "resolved" as const } : view === "starred" ? { starred: true } : {};

/**
 * The operators' feedback inbox, on the phone. Opens on what still needs someone; opening a message marks it
 * seen; one tap resolves it. The same inbox as the web console's Feedback tab.
 */
export default function PlatformFeedbackScreen() {
  useThemeVersion();
  const { state } = useSmartClean();
  const token = state.accessToken;
  const [view, setView] = useState<View_>("open");
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<PlatformFeedback[] | null>(null);
  const [counts, setCounts] = useState<PlatformFeedbackCounts>(EMPTY);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const page = await listPlatformFeedback(token, { ...queryFor(view), category: category ?? undefined, q: search, pageSize: 50 });
      setItems(page.items);
      setCounts(page.counts);
    } catch (error) {
      setItems([]);
      appAlert("Could not load feedback", error instanceof Error ? error.message : "Try again in a moment.");
    }
  }, [token, view, category, search]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const ids = useMemo(() => (items ?? []).map((i) => i.id), [items]);
  const current = items?.find((i) => i.id === openId) ?? null;

  /** Shows the change at once, tells the server, and puts it back if the server says no. */
  async function change(id: string, changes: { status?: FeedbackStatus; starred?: boolean; note?: string }) {
    if (!token) return;
    const before = items?.find((i) => i.id === id);
    if (!before) return;
    setItems((list) => (list ?? []).map((i) => (i.id === id ? { ...i, ...changes } : i)));
    try {
      const saved = await updatePlatformFeedback(token, id, changes);
      setItems((list) => (list ?? []).map((i) => (i.id === id ? saved : i)));
      void load();
    } catch (error) {
      setItems((list) => (list ?? []).map((i) => (i.id === id ? before : i)));
      appAlert("Could not save that", error instanceof Error ? error.message : "Try again.");
    }
  }

  function open(id: string) {
    setOpenId(id);
    const item = items?.find((i) => i.id === id);
    if (item?.status === "new") void change(id, { status: "seen" });
  }

  const views: { value: View_; label: string; count?: number }[] = [
    { value: "open", label: "To do", count: counts.open },
    { value: "new", label: "New", count: counts.new },
    { value: "starred", label: "Starred", count: counts.starred },
    { value: "resolved", label: "Resolved", count: counts.resolved },
    { value: "all", label: "All" },
  ];

  return (
    <Screen title="Feedback">
      <View style={styles.body}>
        <Text style={styles.muted}>
          {counts.open === 0 ? "Nothing waiting. Nicely done." : `${counts.open} waiting for you${counts.new ? `, ${counts.new} new` : ""}`}
          {counts.thisWeek ? ` · ${counts.thisWeek} this week` : ""}
        </Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {views.map((v) => (
            <Chip key={v.value} on={view === v.value} onPress={() => setView(v.value)}>
              {v.count !== undefined ? `${v.label}  ${v.count}` : v.label}
            </Chip>
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip small on={category === null} onPress={() => setCategory(null)}>
            Everything
          </Chip>
          {FEEDBACK_CATEGORIES.map((c) => (
            <Chip key={c.value} small on={category === c.value} onPress={() => setCategory(category === c.value ? null : c.value)}>
              {`${c.plural}  ${counts.openByCategory[c.value]}`}
            </Chip>
          ))}
        </ScrollView>

        <View style={styles.search}>
          <Ionicons name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search message, person or organisation"
            placeholderTextColor={colors.mutedForeground}
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel="Search feedback"
            style={styles.searchInput}
          />
          {query ? (
            <Pressable onPress={() => setQuery("")} accessibilityLabel="Clear search" hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>

        {items === null ? (
          <Text style={styles.muted}>Loading…</Text>
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name={search || category || view !== "open" ? "search" : "checkmark-circle"} size={28} color={colors.success} />
            <Text style={styles.emptyTitle}>{search || category || view !== "open" ? "No messages match" : "Inbox zero"}</Text>
            <Text style={styles.muted}>When someone sends feedback from the app, it appears here.</Text>
          </View>
        ) : (
          items.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`${item.senderName}, ${categoryLabel(item.category)}. ${preview(item.message, 80)}`}
              onPress={() => open(item.id)}
              style={[styles.row, item.status === "resolved" && styles.resolved]}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initialsOf(item.senderName)}</Text>
              </View>
              <View style={styles.flex}>
                <View style={styles.line}>
                  {item.status === "new" ? <View style={styles.dot} /> : null}
                  <Text style={[styles.name, item.status === "new" && styles.bold]} numberOfLines={1}>
                    {item.senderName}
                  </Text>
                  {item.starred ? <Ionicons name="star" size={13} color={colors.warning} /> : null}
                  {item.filePaths.length > 0 ? <Ionicons name="image-outline" size={13} color={colors.mutedForeground} /> : null}
                  <Text style={styles.time}>{timeAgo(item.createdAt)}</Text>
                </View>
                <Text style={styles.muted} numberOfLines={1}>
                  {item.organisation}
                </Text>
                <Text style={styles.preview} numberOfLines={2}>
                  {preview(item.message)}
                </Text>
                <Text style={styles.tag}>
                  {categoryLabel(item.category)}
                  {item.status === "resolved" ? " · Resolved" : ""}
                </Text>
              </View>
            </Pressable>
          ))
        )}
      </View>

      <DetailSheet
        item={current}
        hasPrev={neighbour(ids, openId, -1) !== null}
        hasNext={neighbour(ids, openId, 1) !== null}
        onPrev={() => {
          const id = neighbour(ids, openId, -1);
          if (id) open(id);
        }}
        onNext={() => {
          const id = neighbour(ids, openId, 1);
          if (id) open(id);
        }}
        onClose={() => setOpenId(null)}
        onChange={(changes) => current && change(current.id, changes)}
      />
    </Screen>
  );
}

function Chip({ on, small, onPress, children }: { on: boolean; small?: boolean; onPress: () => void; children: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={[styles.chip, small && styles.chipSmall, on && styles.chipOn]}
    >
      <Text style={[styles.chipText, small && styles.chipTextSmall, on && styles.chipTextOn]}>{children}</Text>
    </Pressable>
  );
}

function DetailSheet({
  item,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onClose,
  onChange,
}: {
  item: PlatformFeedback | null;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onChange: (changes: { status?: FeedbackStatus; starred?: boolean; note?: string }) => void;
}) {
  const insets = useSafeAreaInsets();
  const [note, setNote] = useState("");
  useEffect(() => setNote(item?.note ?? ""), [item?.id, item?.note]);
  const reply = item ? replyLink(item) : null;

  return (
    <Modal visible={item !== null} animationType="slide" onRequestClose={onClose}>
      {item ? (
        <View style={[styles.sheet, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom }]}>
          <View style={styles.sheetBar}>
            <Pressable accessibilityLabel="Close" onPress={onClose} hitSlop={10} style={styles.iconBtn}>
              <Ionicons name="chevron-down" size={22} color={colors.foreground} />
            </Pressable>
            <Text style={styles.sheetTitle}>{categoryLabel(item.category)}</Text>
            <Pressable accessibilityLabel="Previous message" disabled={!hasPrev} onPress={onPrev} hitSlop={8} style={[styles.iconBtn, !hasPrev && styles.dim]}>
              <Ionicons name="chevron-up" size={20} color={colors.foreground} />
            </Pressable>
            <Pressable accessibilityLabel="Next message" disabled={!hasNext} onPress={onNext} hitSlop={8} style={[styles.iconBtn, !hasNext && styles.dim]}>
              <Ionicons name="chevron-down" size={20} color={colors.foreground} />
            </Pressable>
            <Pressable
              accessibilityLabel={item.starred ? "Remove star" : "Star this message"}
              accessibilityState={{ selected: item.starred }}
              onPress={() => onChange({ starred: !item.starred })}
              hitSlop={8}
              style={styles.iconBtn}
            >
              <Ionicons name={item.starred ? "star" : "star-outline"} size={20} color={item.starred ? colors.warning : colors.foreground} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
            <View style={styles.line}>
              <View style={[styles.avatar, styles.avatarBig]}>
                <Text style={styles.avatarText}>{initialsOf(item.senderName)}</Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.nameBig} numberOfLines={1}>
                  {item.senderName}
                </Text>
                <Text style={styles.muted} numberOfLines={1}>
                  {item.senderEmail ?? "No email on file"}
                </Text>
              </View>
            </View>

            <Text style={styles.message} selectable>
              {item.message}
            </Text>

            {item.filePaths.length > 0 && (
              <View style={styles.photos}>
                {item.filePaths.map((path, index) => (
                  <Pressable
                    key={path}
                    accessibilityLabel={`Open screenshot ${index + 1}`}
                    onPress={() => {
                      const url = fileUrl(path);
                      if (url) void Linking.openURL(url);
                    }}
                  >
                    <Image source={{ uri: fileUrl(path) }} style={styles.photo} />
                  </Pressable>
                ))}
              </View>
            )}

            <View style={styles.facts}>
              {(
                [
                  ["Organisation", item.organisation],
                  ["Role", item.senderRole.replace(/_/g, " ")],
                  ["App", [item.appVersion, item.platform].filter(Boolean).join(" · ") || "unknown"],
                  ["Received", new Date(item.createdAt).toLocaleString()],
                ] as const
              ).map(([k, v]) => (
                <View key={k} style={styles.fact}>
                  <Text style={styles.muted}>{k}</Text>
                  <Text style={styles.factValue} numberOfLines={1}>
                    {v}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.actions}>
              {reply ? (
                <Button icon={<Ionicons name="mail-outline" size={16} color={colors.primaryForeground} />} onPress={() => void Linking.openURL(reply)}>
                  Reply by email
                </Button>
              ) : null}
              {item.status === "resolved" ? (
                <Button variant="outline" onPress={() => onChange({ status: "seen" })}>
                  Reopen
                </Button>
              ) : (
                <Button variant={reply ? "outline" : "primary"} onPress={() => onChange({ status: "resolved" })}>
                  Mark resolved
                </Button>
              )}
            </View>

            <Text style={styles.label}>Private note · only your team sees this</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              onBlur={() => note.trim() !== item.note.trim() && onChange({ note })}
              multiline
              placeholder="What you decided, or where it is tracked"
              placeholderTextColor={colors.mutedForeground}
              style={styles.noteInput}
            />
          </ScrollView>
        </View>
      ) : null}
    </Modal>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    body: { gap: spacing.sm },
    flex: { flex: 1, minWidth: 0 },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    chips: { gap: spacing.xs, paddingVertical: 2 },
    chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, paddingHorizontal: spacing.md, minHeight: 40, justifyContent: "center", backgroundColor: colors.card },
    chipSmall: { minHeight: 32, paddingHorizontal: spacing.sm },
    chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: typography.small, fontWeight: "700", color: colors.foreground },
    chipTextSmall: { fontSize: typography.tiny },
    chipTextOn: { color: colors.primaryForeground },
    search: { flexDirection: "row", alignItems: "center", gap: spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, paddingHorizontal: spacing.md, minHeight: 44, backgroundColor: colors.card },
    searchInput: { flex: 1, fontSize: typography.body, color: colors.foreground, paddingVertical: spacing.xs },
    empty: { alignItems: "center", gap: spacing.xs, padding: spacing.xl },
    emptyTitle: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    row: { flexDirection: "row", gap: spacing.sm, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, backgroundColor: colors.card },
    resolved: { opacity: 0.7 },
    avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.muted },
    avatarBig: { width: 48, height: 48, borderRadius: 24 },
    avatarText: { fontSize: typography.small, fontWeight: "800", color: colors.primary },
    line: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
    name: { flex: 1, fontSize: typography.small, fontWeight: "600", color: colors.foreground },
    bold: { fontWeight: "800" },
    time: { fontSize: typography.tiny, color: colors.mutedForeground },
    preview: { fontSize: typography.small, color: colors.foreground, marginTop: 2 },
    tag: { fontSize: typography.tiny, fontWeight: "700", color: colors.mutedForeground, marginTop: 4 },
    sheet: { flex: 1, backgroundColor: colors.background },
    sheetBar: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.md, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
    sheetTitle: { flex: 1, fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.muted },
    dim: { opacity: 0.35 },
    sheetBody: { padding: spacing.md, gap: spacing.md },
    nameBig: { fontSize: typography.body, fontWeight: "800", color: colors.foreground },
    message: { fontSize: 16, lineHeight: 24, color: colors.foreground },
    photos: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    photo: { width: 88, height: 88, borderRadius: radius.md },
    facts: { gap: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
    fact: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
    factValue: { flex: 1, textAlign: "right", fontSize: typography.small, fontWeight: "600", color: colors.foreground, textTransform: "capitalize" },
    actions: { gap: spacing.sm },
    label: { fontSize: typography.tiny, fontWeight: "700", color: colors.mutedForeground, textTransform: "uppercase" },
    noteInput: { minHeight: 80, textAlignVertical: "top", borderWidth: 1, borderColor: colors.input, borderRadius: radius.md, padding: spacing.sm, fontSize: typography.body, color: colors.foreground, backgroundColor: colors.card },
  }),
);
