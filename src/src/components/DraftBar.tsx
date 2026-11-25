import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "@/components/Button";
import { appAlert } from "@/components/Dialog";
import { sendBookingBatch } from "@/api/client";
import { dayHeading } from "@/domain/schedule";
import { describeEntry, entriesOf, keepSkipped, stageIn, summariseAll, summaryText, toBatchEntries } from "@/domain/rosterDraft";
import { setDrafts, useDrafts } from "@/features/rosterDraftStore";
import { useSmartClean } from "@/features/store";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

/**
 * The bar at the top of every schedule view holding the changes not sent yet. Nothing reaches anyone until "Send
 * schedules"; then each person gets one notification and one email per site covering their own changes. "Review"
 * lists exactly what is waiting, each with a way to take it back out.
 */
export function DraftBar({ siteName, onSent }: { siteName: (siteId: string) => string; onSent: () => void }) {
  useThemeVersion();
  const { state } = useSmartClean();
  const token = state.accessToken;
  const drafts = useDrafts();
  const [sending, setSending] = useState(false);
  const [review, setReview] = useState(false);
  const summary = summariseAll(drafts);
  if (summary.total === 0) return null;
  const sites = Object.keys(drafts);

  async function send() {
    if (!token) return;
    setSending(true);
    let applied = 0;
    const told = new Set<string>();
    const skipped: { userName: string; date: string; reason?: string }[] = [];
    const failed: string[] = [];
    for (const siteId of sites) {
      try {
        const result = await sendBookingBatch(token, { siteId, entries: toBatchEntries(drafts[siteId]) });
        for (const b of [...result.created, ...result.updated, ...result.cancelled]) {
          applied += 1;
          told.add(b.userId);
        }
        skipped.push(...result.skipped);
        setDrafts((all) => {
          const kept = keepSkipped(all[siteId] ?? {}, result.skipped);
          const next = { ...all };
          if (Object.keys(kept).length === 0) delete next[siteId];
          else next[siteId] = kept;
          return next;
        });
      } catch (error) {
        failed.push(`${siteName(siteId)}: ${error instanceof Error ? error.message : "could not send"}`);
      }
    }
    setSending(false);
    const lines: string[] = [];
    if (applied > 0) lines.push(`Sent ${applied} ${applied === 1 ? "change" : "changes"} to ${told.size} ${told.size === 1 ? "person" : "people"}.`);
    else if (skipped.length === 0 && failed.length === 0) lines.push("Nothing needed to change, so no one was told.");
    if (skipped.length > 0) {
      const shown = skipped.slice(0, 3).map((x) => `${x.userName} on ${dayHeading(x.date)}: ${x.reason ?? "not applied"}`).join("\n");
      lines.push(`Not applied:\n${shown}${skipped.length > 3 ? `\nand ${skipped.length - 3} more` : ""}\nThey are still marked so you can fix them.`);
    }
    if (failed.length > 0) lines.push(`${failed.join("\n")}\nStill marked, so you can try again.`);
    appAlert(applied > 0 ? "Schedules sent" : "Nothing sent", lines.join("\n\n"));
    onSent();
  }

  const confirmSend = () =>
    appAlert(
      "Send these schedules?",
      `${summaryText(summary)} for ${summary.people} ${summary.people === 1 ? "person" : "people"}${sites.length > 1 ? ` across ${sites.length} sites` : ` at ${siteName(sites[0])}`}. Each person gets one notification and one email with their own changes.`,
      [
        { text: "Keep editing", style: "cancel" },
        { text: "Send schedules", onPress: () => void send() },
      ],
    );
  const confirmDiscard = () =>
    appAlert("Discard these changes?", "Nothing has been sent, so no one is told. Everything marked is cleared.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => setDrafts({}) },
    ]);

  return (
    <View style={styles.bar} accessibilityLabel="Changes not sent yet">
      <Text style={styles.title}>{summaryText(summary)}</Text>
      <Text style={styles.muted}>
        For {summary.people} {summary.people === 1 ? "person" : "people"}. Nobody is told until you send.
      </Text>
      <View style={styles.row}>
        <Button loading={sending} onPress={confirmSend}>Send schedules</Button>
        <Button variant="outline" disabled={sending} onPress={() => setReview((r) => !r)}>{review ? "Hide list" : "Review"}</Button>
        <Button variant="ghost" disabled={sending} onPress={confirmDiscard}>Discard</Button>
      </View>
      {review &&
        entriesOf(drafts).map(({ siteId, entry }) => (
          <View key={`${siteId}|${entry.userId}|${entry.date}`} style={styles.item}>
            <Text style={styles.itemText} numberOfLines={2}>
              {describeEntry(entry)}
              {sites.length > 1 ? ` · ${siteName(siteId)}` : ""}
            </Text>
            <Pressable
              onPress={() => setDrafts((all) => stageIn(all, siteId, entry.userId, entry.date, null))}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${entry.userName} on ${entry.date} from the changes`}
            >
              <Ionicons name="close" size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>
        ))}
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    bar: { borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, backgroundColor: colors.card, padding: spacing.md, gap: spacing.xs },
    title: { fontSize: typography.body, fontWeight: "800", color: colors.foreground },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    row: { gap: spacing.xs, marginTop: spacing.xs },
    item: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    itemText: { flex: 1, fontSize: typography.small, color: colors.foreground },
  }),
);
