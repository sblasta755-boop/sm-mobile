import { useCallback, useState } from "react";
import { Redirect, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { ago } from "@/components/NoticeBits";
import { NoticeContent } from "@/components/NoticeContent";
import { appAlert } from "@/components/Dialog";
import {
  acknowledgeNotice,
  archiveNotice,
  cancelNotice,
  deleteNoticeDraft,
  getNotice,
  getNoticeReceipts,
  nudgeNotice,
  publishNotice,
  refreshNoticeAudience,
  type Notice,
  type NoticeReceipts,
} from "@/api/client";
import { audienceText } from "@/domain/noticeboard";
import { useNoticeboardOn } from "@/features/noticeboard";
import { useHomePath, useRoleLabel } from "@/features/roles";
import { useSmartClean } from "@/features/store";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

type Tab = "unread" | "read" | "acked";

/** One notice in full: the detail, the acknowledge button, and for its author or a manager, who has seen it. */
export default function NoticeScreen() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useSmartClean();
  const on = useNoticeboardOn();
  const homePath = useHomePath();
  const roleLabel = useRoleLabel();
  const token = state.accessToken;
  const [notice, setNotice] = useState<Notice | null>(null);
  const [missing, setMissing] = useState(false);
  const [receipts, setReceipts] = useState<NoticeReceipts | null>(null);
  const [tab, setTab] = useState<Tab>("unread");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token || !id) return;
    try {
      const n = await getNotice(token, id);
      setNotice(n);
      setMissing(false);
      setReceipts(n.canManage && n.status !== "draft" ? await getNoticeReceipts(token, id) : null);
    } catch {
      setMissing(true);
    }
  }, [token, id]);
  useFocusEffect(
    useCallback(() => {
      if (on) void load();
    }, [on, load]),
  );

  if (!on) return <Redirect href={homePath as never} />;

  const run = async (work: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await work();
      if (done) appAlert(done, undefined, undefined, "success");
      await load();
    } catch (error) {
      appAlert("That did not work", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const ask = (title: string, message: string, confirmText: string, action: () => void) =>
    appAlert(title, message, [{ text: "Keep it", style: "cancel" }, { text: confirmText, style: "destructive", onPress: action }]);

  if (missing)
    return (
      <Screen title="Notice">
        <Card>
          <Text style={styles.muted}>This notice is not available. It may have been removed.</Text>
        </Card>
      </Screen>
    );
  if (!notice)
    return (
      <Screen title="Notice">
        <ActivityIndicator color={colors.primary} />
      </Screen>
    );

  const siteName = (siteId: string) => state.sites.find((s) => s.id === siteId)?.name ?? "A site";
  const live = notice.status === "published";
  const people = receipts?.people.filter((p) => p.state === tab) ?? [];
  const waiting = receipts ? (notice.requiresAck ? receipts.total - receipts.acked : receipts.total - receipts.read) : 0;
  const pct = receipts && receipts.total ? Math.round(((notice.requiresAck ? receipts.acked : receipts.read) / receipts.total) * 100) : 0;

  return (
    <Screen title="Notice" backTo="/noticeboard">
      <NoticeContent
        category={notice.category}
        pinned={notice.pinned}
        title={notice.title}
        byline={`${notice.authorName} · ${roleLabel(notice.authorRole)} · ${ago(notice.publishedAt ?? notice.createdAt)}`}
        whenText={notice.whenText}
        forText={audienceText(notice.audience, siteName, (k) => roleLabel(k))}
        body={notice.body}
        attachments={notice.attachments}
        requiresAck={notice.requiresAck}
      />
      {notice.status === "cancelled" && <Text style={[styles.banner, styles.bannerRed]}>This notice was cancelled.</Text>}
      {notice.status === "archived" && <Text style={styles.banner}>This notice has ended.</Text>}
      {notice.status === "draft" && <Text style={styles.banner}>Draft. Nobody has been told yet.</Text>}

      {notice.needsAck && (
        <Button disabled={busy} icon={<Ionicons name="checkmark" size={20} color={colors.primaryForeground} />} onPress={() => token && void run(() => acknowledgeNotice(token, notice.id), "Thank you")}>
          I have read and understood
        </Button>
      )}
      {notice.requiresAck && notice.acked && <Text style={styles.ok}>You acknowledged this notice.</Text>}

      {notice.canManage && (
        <Card style={styles.manage}>
          {notice.status === "draft" && (
            <Button disabled={busy} onPress={() => token && void run(() => publishNotice(token, notice.id), "Posted")}>
              Post it
            </Button>
          )}
          {notice.status !== "archived" && notice.status !== "cancelled" && (
            <Button variant="outline" disabled={busy} onPress={() => router.push(`/notice-new?edit=${notice.id}` as never)}>
              Edit
            </Button>
          )}
          {live && (
            <Button
              variant="outline"
              disabled={busy}
              onPress={() => ask("Cancel this notice?", "Everyone it was sent to is told it was cancelled.", "Cancel the notice", () => token && void run(() => cancelNotice(token, notice.id), "Cancelled"))}
            >
              Cancel it
            </Button>
          )}
          {live && (
            <Button variant="ghost" disabled={busy} onPress={() => token && void run(() => archiveNotice(token, notice.id), "Archived")}>
              Archive
            </Button>
          )}
          {notice.status === "draft" && (
            <Button
              variant="destructive"
              disabled={busy}
              onPress={() =>
                ask("Delete this draft?", "It cannot be brought back.", "Delete", () => {
                  if (token) void deleteNoticeDraft(token, notice.id).then(() => router.back()).catch((e) => appAlert("Could not delete", e instanceof Error ? e.message : "Please try again."));
                })
              }
            >
              Delete draft
            </Button>
          )}

          {receipts && (
            <View style={{ gap: spacing.sm }}>
              <View style={styles.rowBetween}>
                <Text style={styles.h2}>{notice.requiresAck ? "Acknowledgements" : "Who has read it"}</Text>
                <Text style={styles.muted}>
                  {notice.requiresAck ? `${receipts.acked} of ${receipts.total} acknowledged` : `${receipts.read} of ${receipts.total} read`}
                </Text>
              </View>
              <View style={styles.bar}>
                <View style={[styles.barFill, { width: `${pct}%` }]} />
              </View>
              <View style={styles.tabs}>
                {(["unread", "read", "acked"] as const)
                  .filter((t) => t !== "acked" || notice.requiresAck)
                  .map((t) => (
                    <Pressable key={t} accessibilityRole="tab" accessibilityState={{ selected: tab === t }} style={[styles.chip, tab === t && styles.chipOn]} onPress={() => setTab(t)}>
                      <Text style={[styles.chipText, tab === t && styles.chipTextOn]}>
                        {t === "unread" ? "Not opened" : t === "read" ? "Read" : "Acknowledged"} ({receipts.people.filter((p) => p.state === t).length})
                      </Text>
                    </Pressable>
                  ))}
              </View>
              {people.length === 0 && <Text style={styles.muted}>Nobody here.</Text>}
              {people.map((p) => (
                <View key={p.userId} style={styles.person}>
                  <Text style={styles.value}>
                    {p.name} <Text style={styles.muted}>· {roleLabel(p.role)}</Text>
                  </Text>
                  <Text style={styles.muted}>{p.ackedAt ? `Acked ${ago(p.ackedAt)}` : p.readAt ? `Read ${ago(p.readAt)}` : ""}</Text>
                </View>
              ))}
              {live && (
                <>
                  <Button
                    variant="outline"
                    disabled={busy || waiting === 0}
                    onPress={() =>
                      token &&
                      void run(async () => {
                        const r = await nudgeNotice(token, notice.id);
                        appAlert(`Reminded ${r.sent} ${r.sent === 1 ? "person" : "people"}`, undefined, undefined, "success");
                      })
                    }
                  >
                    {`Nudge the ${waiting}`}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onPress={() =>
                      token &&
                      void run(async () => {
                        const r = await refreshNoticeAudience(token, notice.id);
                        appAlert(r.added ? `Added ${r.added} new ${r.added === 1 ? "person" : "people"}` : "Nobody new to add", undefined, undefined, "success");
                      })
                    }
                  >
                    Add newly assigned people
                  </Button>
                </>
              )}
            </View>
          )}
        </Card>
      )}
    </Screen>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    h1: { fontSize: 24, fontWeight: "800", color: colors.foreground, marginTop: 2 },
    h2: { fontSize: typography.body, fontWeight: "800", color: colors.foreground },
    label: { fontSize: 10, letterSpacing: 0.8, fontWeight: "700", color: colors.mutedForeground },
    value: { fontSize: typography.body, color: colors.foreground },
    body: { fontSize: typography.body, lineHeight: 22, color: colors.foreground, marginVertical: spacing.md },
    field: { marginTop: spacing.sm, gap: 4 },
    banner: { fontSize: typography.small, fontWeight: "700", color: colors.foreground, backgroundColor: colors.muted, padding: spacing.sm, borderRadius: radius.md, marginTop: spacing.sm, overflow: "hidden" },
    bannerRed: { color: colors.destructive },
    ok: { fontSize: typography.small, fontWeight: "700", color: colors.success, marginTop: spacing.sm },
    photo: { width: "100%", height: 200, borderRadius: radius.lg, marginBottom: spacing.sm },
    file: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
    manage: { gap: spacing.sm, marginTop: spacing.md },
    rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
    bar: { height: 8, borderRadius: 99, backgroundColor: colors.muted, overflow: "hidden" },
    barFill: { height: "100%", backgroundColor: colors.success },
    tabs: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    chip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.round, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: typography.small, fontWeight: "600", color: colors.mutedForeground },
    chipTextOn: { color: colors.primaryForeground },
    person: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  }),
);
