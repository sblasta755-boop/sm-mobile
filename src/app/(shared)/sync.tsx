import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { ago, syncHeadline, syncSummary, type SyncItem } from "@/domain/syncStatus";
import { getOutbox, removeMutation, useOutbox } from "@/features/outbox";
import { getQueue, removePhoto, useEvidenceQueue } from "@/features/evidenceQueue";
import { drainQueue } from "@/features/evidenceUploader";
import { useLastSynced } from "@/features/lastSynced";
import { useSmartClean } from "@/features/store";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

/** Whether this phone's work has reached the server, a way to send it now, and anything refused. */
export default function SyncScreen() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { state, currentUser, refreshBackendData } = useSmartClean();
  const outbox = useOutbox();
  const photos = useEvidenceQueue();
  const lastSynced = useLastSynced();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const offline = state.connectivity === "offline";
  const summary = syncSummary({ outbox, photos, userId: currentUser?.id, offline });
  const taskTitle = (item: SyncItem) => (item.taskId ? state.tasks.find((t) => t.id === item.taskId)?.title : undefined);

  const tone = summary.state === "refused" ? "bad" : summary.state === "synced" ? "good" : "warn";
  const icon =
    summary.state === "synced" ? "checkmark-circle" : summary.state === "refused" ? "alert-circle" : offline ? "cloud-offline-outline" : "sync-outline";

  async function syncNow() {
    setBusy(true);
    setResult(null);
    try {
      await drainQueue();
      await refreshBackendData();
      const left = syncSummary({ outbox: getOutbox(), photos: getQueue(), userId: currentUser?.id, offline: false });
      setResult(left.waiting.length === 0 ? "Synced just now." : `${left.waiting.length} still waiting. Try again when the signal is better.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Sync status">
      <Card style={styles.status}>
        <View style={[styles.disc, tone === "good" && styles.discGood, tone === "bad" && styles.discBad, tone === "warn" && styles.discWarn]}>
          <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={24} color={tone === "good" ? colors.success : tone === "bad" ? colors.destructive : colors.warningForeground} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.headline}>{syncHeadline(summary)}</Text>
          <Text style={styles.muted}>{offline ? "No connection right now" : "Connected"}</Text>
          <Text style={styles.muted}>Last synced: {lastSynced ? ago(lastSynced) : "not yet on this phone"}</Text>
        </View>
      </Card>

      <Button disabled={busy || offline} onPress={() => void syncNow()} icon={busy ? <ActivityIndicator color={colors.primaryForeground} /> : <Ionicons name="sync" size={18} color={colors.primaryForeground} />}>
        {busy ? "Syncing..." : "Sync now"}
      </Button>
      {offline && <Text style={styles.muted}>You are offline. Everything you do is saved on this phone and sent when the connection returns.</Text>}
      {result && !offline && <Text style={styles.result}>{result}</Text>}

      {summary.refused.length > 0 && (
        <View style={styles.group}>
          <Text style={styles.groupTitle}>Not accepted</Text>
          {summary.refused.map((item) => (
            <Card key={item.id} style={[styles.item, styles.itemBad]}>
              <View style={styles.flex}>
                <Text style={styles.itemTitle}>{cap(item.label)}</Text>
                {taskTitle(item) && <Text style={styles.muted}>{taskTitle(item)}</Text>}
                <Text style={styles.errorText}>{item.error ?? "The server refused it."}</Text>
              </View>
              <Pressable accessibilityRole="button" onPress={() => void (item.type === "photo" ? removePhoto(item.id) : removeMutation(item.id))}>
                <Text style={styles.link}>Dismiss</Text>
              </Pressable>
            </Card>
          ))}
        </View>
      )}

      {summary.waiting.length > 0 && (
        <View style={styles.group}>
          <Text style={styles.groupTitle}>Waiting to send ({summary.waiting.length})</Text>
          {summary.waiting.map((item) => (
            <Card key={item.id} style={styles.item}>
              <Ionicons name={item.type === "photo" ? "image-outline" : "create-outline"} size={18} color={colors.mutedForeground} />
              <View style={styles.flex}>
                <Text style={styles.itemTitle}>{cap(item.label)}</Text>
                {taskTitle(item) && <Text style={styles.muted} numberOfLines={1}>{taskTitle(item)}</Text>}
                <Text style={styles.muted}>Saved {ago(item.savedAt)}{item.attempts > 0 ? ` · tried ${item.attempts} time${item.attempts === 1 ? "" : "s"}` : ""}</Text>
              </View>
            </Card>
          ))}
        </View>
      )}

      <Text style={styles.footnote}>
        Work you do is saved on this phone first, so it is safe even with no signal. It is sent to the server as soon as there is a connection, and anything the server cannot accept is listed here with the reason.
      </Text>
    </Screen>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const styles = themedStyles(() =>
  StyleSheet.create({
    flex: { flex: 1, minWidth: 0 },
    status: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md },
    disc: { width: 48, height: 48, borderRadius: radius.xl, alignItems: "center", justifyContent: "center" },
    discGood: { backgroundColor: colors.successSoft },
    discBad: { backgroundColor: colors.destructiveSoft },
    discWarn: { backgroundColor: colors.warningSoft },
    headline: { fontSize: typography.body, fontWeight: "800", color: colors.foreground },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    result: { fontSize: typography.small, fontWeight: "600", color: colors.foreground, marginTop: spacing.xs },
    group: { marginTop: spacing.lg, gap: spacing.sm },
    groupTitle: { fontSize: typography.body, fontWeight: "800", color: colors.foreground },
    item: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    itemBad: { borderColor: colors.destructive },
    itemTitle: { fontSize: typography.body, fontWeight: "600", color: colors.foreground },
    errorText: { fontSize: typography.small, color: colors.destructive },
    link: { fontSize: typography.small, fontWeight: "700", color: colors.primary },
    footnote: { fontSize: typography.small, color: colors.mutedForeground, marginTop: spacing.lg },
  }),
);
