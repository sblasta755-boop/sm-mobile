import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSmartClean } from "@/features/store";
import { removeMutation, useOutbox } from "@/features/outbox";
import { removePhoto, useEvidenceQueue } from "@/features/evidenceQueue";
import { drainQueue } from "@/features/evidenceUploader";
import { colors, spacing, themedStyles, typography, useThemeVersion } from "@/theme";

const KIND_LABEL: Record<string, string> = {
  "task.start": "starting a task",
  "task.checklist": "a checklist tick",
  "task.note": "a note",
  "task.submit": "a submission",
  "incident.create": "an incident report",
};

/**
 * What is waiting to reach the server, and anything it refused. Shown on every
 * screen: offline work is only trustworthy if the person can see it is saved
 * and, if something was not accepted, can see which one and why.
 */
export function SyncBanner() {
  useThemeVersion();
  const { state, currentUser } = useSmartClean();
  const outbox = useOutbox();
  const photos = useEvidenceQueue();
  const mine = (userId: string) => userId === currentUser?.id;

  const waiting =
    outbox.filter((m) => mine(m.userId) && m.status !== "rejected").length +
    photos.filter((p) => mine(p.userId) && p.status !== "rejected").length;
  const refusedChanges = outbox.filter((m) => mine(m.userId) && m.status === "rejected");
  const refusedPhotos = photos.filter((p) => mine(p.userId) && p.status === "rejected");
  const offline = state.connectivity === "offline";

  if (waiting === 0 && refusedChanges.length === 0 && refusedPhotos.length === 0 && !offline) return null;

  return (
    <View>
      {waiting === 0 && offline && (
        <View style={[styles.bar, styles.barOffline]}>
          <Ionicons name="cloud-offline-outline" size={16} color={colors.foreground} />
          <Text style={styles.text}>
            Offline. You can keep working: ticks, notes, photos, incident reports and submissions are saved on this
            phone and sent when you reconnect.
          </Text>
        </View>
      )}
      {waiting > 0 && (
        <Pressable
          accessibilityRole="button"
          onPress={() => void drainQueue()}
          style={[styles.bar, offline ? styles.barOffline : styles.barSending]}
        >
          <Ionicons name={offline ? "cloud-offline-outline" : "sync-outline"} size={16} color={colors.foreground} />
          <Text style={styles.text}>
            {offline
              ? `Offline. ${waiting} change${waiting === 1 ? "" : "s"} saved on this phone, sent when you reconnect.`
              : `Sending ${waiting} saved change${waiting === 1 ? "" : "s"}...`}
          </Text>
        </Pressable>
      )}
      {refusedChanges.map((m) => (
        <View key={m.id} style={[styles.bar, styles.barRefused]}>
          <Ionicons name="alert-circle" size={16} color={colors.destructive} />
          <Text style={styles.text}>
            Not accepted ({KIND_LABEL[m.kind] ?? m.kind}): {m.error ?? "the server refused it"}
          </Text>
          <Pressable accessibilityRole="button" onPress={() => void removeMutation(m.id)}>
            <Text style={styles.action}>Dismiss</Text>
          </Pressable>
        </View>
      ))}
      {refusedPhotos.map((p) => (
        <View key={p.id} style={[styles.bar, styles.barRefused]}>
          <Ionicons name="alert-circle" size={16} color={colors.destructive} />
          <Text style={styles.text}>Photo not accepted: {p.error ?? "the server refused it"}</Text>
          <Pressable accessibilityRole="button" onPress={() => void removePhoto(p.id)}>
            <Text style={styles.action}>Dismiss</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    bar: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    barOffline: { backgroundColor: colors.warningSoft },
    barSending: { backgroundColor: colors.infoSoft },
    barRefused: { backgroundColor: colors.destructiveSoft },
    text: { flex: 1, fontSize: typography.small, color: colors.foreground },
    action: { fontSize: typography.small, fontWeight: "700", color: colors.primary },
  }),
);
