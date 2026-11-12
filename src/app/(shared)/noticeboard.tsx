import { useCallback, useMemo, useState } from "react";
import { Redirect, router, useFocusEffect } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { NoticeCard } from "@/components/NoticeBits";
import { appAlert } from "@/components/Dialog";
import { listNotices, type Notice, type NoticeScope } from "@/api/client";
import { NOTICE_CATEGORIES, agendaGroups } from "@/domain/noticeboard";
import { useCanPostNotices, useNoticeboardOn } from "@/features/noticeboard";
import { useHomePath } from "@/features/roles";
import { useSmartClean } from "@/features/store";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

/** What you need to know, for specific days and for good: the board, with a new-notice button for managers. */
export default function NoticeboardScreen() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { state } = useSmartClean();
  const on = useNoticeboardOn();
  const canPost = useCanPostNotices();
  const homePath = useHomePath();
  const [scope, setScope] = useState<NoticeScope>("board");
  const [category, setCategory] = useState("");
  const [agenda, setAgenda] = useState(false);
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const token = state.accessToken;

  useFocusEffect(
    useCallback(() => {
      if (!on || !token) return;
      let live = true;
      listNotices(token, { scope, category: category || undefined })
        .then((rows) => live && setNotices(rows))
        .catch((error) => {
          if (!live) return;
          setNotices((cur) => cur ?? []);
          appAlert("Could not load the noticeboard", error instanceof Error ? error.message : "Please try again.");
        });
      return () => {
        live = false;
      };
    }, [on, token, scope, category]),
  );

  const groups = useMemo(() => (agenda && scope === "board" ? agendaGroups(notices ?? []) : null), [agenda, scope, notices]);
  if (!on) return <Redirect href={homePath as never} />;
  const unread = (notices ?? []).filter((n) => !n.read).length;
  const open = (id: string) => router.push(`/notice/${id}` as never);

  const tab = (value: NoticeScope, label: string) => (
    <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: scope === value }} style={[styles.chip, scope === value && styles.chipOn]} onPress={() => { setNotices(null); setScope(value); }}>
      <Text style={[styles.chipText, scope === value && styles.chipTextOn]}>
        {label}
        {value === "board" && scope === "board" && unread > 0 ? ` · ${unread} new` : ""}
      </Text>
    </Pressable>
  );

  return (
    <Screen title="Noticeboard">
      <Text style={styles.muted}>What you need to know, for specific days and for good.</Text>
      {canPost && (
        <Button style={styles.newButton} icon={<Ionicons name="add" size={20} color={colors.primaryForeground} />} onPress={() => router.push("/notice-new" as never)}>
          New notice
        </Button>
      )}
      <View style={styles.tabsRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={{ flex: 1 }}>
          {tab("board", "Live")}
          {canPost && tab("drafts", "Drafts")}
          {tab("archived", "Past")}
        </ScrollView>
        {scope === "board" && (
          <Pressable accessibilityRole="button" accessibilityLabel={agenda ? "Show as a feed" : "Show by day"} onPress={() => setAgenda(!agenda)} style={styles.viewToggle}>
            <Ionicons name={agenda ? "list-outline" : "calendar-outline"} size={20} color={colors.foreground} />
          </Pressable>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Pressable style={[styles.chip, !category && styles.chipOn]} onPress={() => { setNotices(null); setCategory(""); }}>
          <Text style={[styles.chipText, !category && styles.chipTextOn]}>All</Text>
        </Pressable>
        {NOTICE_CATEGORIES.map((c) => (
          <Pressable key={c.key} style={[styles.chip, category === c.key && styles.chipOn]} onPress={() => { setNotices(null); setCategory(category === c.key ? "" : c.key); }}>
            <Text style={[styles.chipText, category === c.key && styles.chipTextOn]}>{c.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {!notices && <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />}
      {notices && notices.length === 0 && (
        <Card style={styles.empty}>
          <Ionicons name="megaphone-outline" size={32} color={colors.primary} />
          <Text style={styles.emptyTitle}>
            {scope === "drafts" ? "No drafts" : scope === "archived" ? "Nothing in the past yet" : "Nothing on the board"}
          </Text>
          <Text style={[styles.muted, styles.center]}>
            {canPost && scope === "board" ? "Post a notice to tell people about a meeting, a change or something to know." : "When there is something to know, it shows up here."}
          </Text>
        </Card>
      )}
      <View style={{ marginTop: spacing.sm }}>
        {groups
          ? groups.map((g) => (
              <View key={g.key}>
                <View style={styles.dayRow}>
                  <Text style={styles.dayText}>{g.heading.toUpperCase()}</Text>
                  <View style={styles.dayLine} />
                  <Text style={styles.dayCount}>{g.items.length}</Text>
                </View>
                {g.items.map((n) => (
                  <NoticeCard key={n.id} notice={n} compact onPress={() => open(n.id)} />
                ))}
              </View>
            ))
          : (notices ?? []).map((n) => <NoticeCard key={n.id} notice={n} onPress={() => open(n.id)} />)}
      </View>
    </Screen>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    center: { textAlign: "center" },
    newButton: { marginVertical: spacing.md },
    tabsRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    chips: { gap: spacing.sm, paddingVertical: spacing.sm },
    chip: { paddingHorizontal: spacing.lg, paddingVertical: 7, borderRadius: radius.round, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: typography.small, fontWeight: "600", color: colors.mutedForeground },
    chipTextOn: { color: colors.primaryForeground },
    viewToggle: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    empty: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl, marginTop: spacing.md },
    emptyTitle: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    dayRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm, marginBottom: spacing.sm },
    dayText: { fontSize: 11, fontWeight: "800", letterSpacing: 1, color: colors.mutedForeground },
    dayLine: { flex: 1, height: 1, backgroundColor: colors.border },
    dayCount: { fontSize: 11, fontWeight: "800", color: colors.primaryForeground, backgroundColor: colors.primary, paddingHorizontal: 8, borderRadius: 99, overflow: "hidden" },
  }),
);
