import { timeSpentLabel } from "@/domain/timeSpent";
import { useState } from "react";
import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { TagChips } from "@/components/TagChip";
import { fileUrl } from "@/api/client";
import { groupChecklist, isSectioned } from "@/domain/checklistSections";
import { evidenceByItem } from "@/domain/evidenceByItem";
import { humanStatus } from "@/domain/status";
import { strokesToPath } from "@/domain/signoff";
import type {
  ChecklistItem,
  Evidence,
  Inspection,
  Task,
} from "@/types/smartclean";
import {
  colors,
  radius,
  spacing,
  status as statusColors,
  themedStyles,
  typography,
  type StatusTone,
} from "@/theme";

/** Statuses where the work is over: the task opens as a record, not a worksheet. */
export const FINISHED_VIEW_STATUSES = [
  "submitted",
  "awaiting_inspection",
  "resubmitted",
  "approved",
  "closed",
  "cancelled",
  "failed",
];

const HEADLINE: Record<
  string,
  {
    tone: StatusTone;
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    text: string;
  }
> = {
  approved: {
    tone: "success",
    icon: "checkmark-circle",
    title: "Approved",
    text: "This task was completed and passed.",
  },
  closed: {
    tone: "success",
    icon: "checkmark-circle",
    title: "Completed",
    text: "This task was completed and closed.",
  },
  submitted: {
    tone: "info",
    icon: "paper-plane",
    title: "Submitted",
    text: "Handed in and waiting for review.",
  },
  awaiting_inspection: {
    tone: "info",
    icon: "search",
    title: "Waiting for inspection",
    text: "Handed in and waiting to be inspected.",
  },
  resubmitted: {
    tone: "info",
    icon: "refresh-circle",
    title: "Resubmitted",
    text: "Handed in again after rework.",
  },
  failed: {
    tone: "destructive",
    icon: "close-circle",
    title: "Not completed in time",
    text: "This task passed its due time and was marked failed.",
  },
  cancelled: {
    tone: "destructive",
    icon: "ban",
    title: "Cancelled",
    text: "This task was cancelled.",
  },
};

const timeOf = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString("en-ZA", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
const dateTimeOf = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-ZA", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

/**
 * A finished task, read-only: what it was, who did it and when, the sign-off,
 * the inspection result, and the checklist with each item's note and the photos
 * that prove it. Nothing here can be changed.
 */
export function TaskSummary({
  task,
  doerName,
  inspection,
  backTo,
}: {
  task: Task;
  doerName?: string;
  inspection?: Inspection;
  backTo?: string;
}) {
  const [viewing, setViewing] = useState<{ uri: string; label: string } | null>(
    null,
  );
  const headline = HEADLINE[task.status] ?? {
    tone: "neutral" as StatusTone,
    icon: "information-circle" as const,
    title: humanStatus(task.status),
    text: "",
  };
  const tone = statusColors[headline.tone];
  const { byItem, loose } = evidenceByItem(task.checklist, task.evidence);
  const countable = task.checklist.filter((item) => item.type !== "note");
  const doneCount = countable.filter((item) => item.done).length;
  const caption = (e: Evidence) =>
    e.kind === "before"
      ? "Before"
      : e.kind === "after"
        ? "After"
        : e.label || e.kind;
  const took = timeSpentLabel(task);

  const thumb = (e: Evidence) => {
    const uri = fileUrl(e.filePath) ?? e.uri;
    return (
      <Pressable
        key={e.id}
        disabled={!uri}
        accessibilityLabel={`View ${caption(e)} photo full size`}
        onPress={() => uri && setViewing({ uri, label: caption(e) })}
        style={styles.thumbWrap}
      >
        {uri ? (
          <Image source={{ uri }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbEmpty]} />
        )}
        <Text style={styles.thumbLabel} numberOfLines={1}>
          {caption(e)}
        </Text>
      </Pressable>
    );
  };

  const row = (item: ChecklistItem) => {
    const photos = byItem[item.id] ?? [];
    return (
      <View key={item.id} style={styles.item}>
        <View style={styles.itemRow}>
          <Ionicons
            name={
              item.done || item.type === "note"
                ? "checkmark-circle"
                : "close-circle"
            }
            size={18}
            color={
              item.done || item.type === "note"
                ? colors.success
                : colors.destructive
            }
          />
          <View style={styles.itemBody}>
            <Text style={styles.itemLabel}>{item.label}</Text>
            {!!item.value && (
              <Text style={styles.itemValue}>&ldquo;{item.value}&rdquo;</Text>
            )}
            {!!item.note && (
              <View style={styles.noteBox}>
                <Text style={styles.noteTag}>NOTE</Text>
                <Text style={styles.noteText}>{item.note}</Text>
              </View>
            )}
          </View>
        </View>
        {photos.length > 0 && (
          <View style={styles.photoRow}>{photos.map(thumb)}</View>
        )}
      </View>
    );
  };

  return (
    <Screen title={task.title} backTo={backTo}>
      <View
        style={[
          styles.banner,
          { backgroundColor: tone.bg, borderColor: tone.border },
        ]}
      >
        <Ionicons name={headline.icon} size={26} color={tone.fg} />
        <View style={styles.bannerText}>
          <Text style={[styles.bannerTitle, { color: tone.fg }]}>
            {headline.title}
          </Text>
          {!!headline.text && (
            <Text style={styles.bannerSub}>{headline.text}</Text>
          )}
        </View>
      </View>

      <Card style={styles.card}>
        <Fact
          icon="location-outline"
          label="Where"
          value={task.locationName ?? "Whole site"}
        />
        <Fact
          icon="time-outline"
          label={task.hasTimeRange ? "Time range" : "Due"}
          value={task.dueTime || "No due time"}
        />
        <Fact
          icon="person-outline"
          label="Done by"
          value={doerName ?? "Unknown"}
        />
        {!!task.startedAt && (
          <Fact
            icon="play-outline"
            label="Started"
            value={dateTimeOf(task.startedAt) ?? ""}
          />
        )}
        {!!task.submittedAt && (
          <Fact
            icon="paper-plane-outline"
            label="Submitted"
            value={dateTimeOf(task.submittedAt) ?? ""}
          />
        )}
        {!!took && (
          <Fact icon="hourglass-outline" label="Time spent" value={took} />
        )}
        <Fact icon="flag-outline" label="Priority" value={task.priority} />
        {!!task.tags?.length && <TagChips tags={task.tags} max={8} />}
      </Card>

      {!!task.signoff && (task.signoff.name || task.signoff.path) && (
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Signed off</Text>
          {task.signoff.path && task.signoff.width && task.signoff.height ? (
            <View style={styles.signature}>
              <Svg
                width="100%"
                height={80}
                viewBox={`0 0 ${task.signoff.width} ${task.signoff.height}`}
              >
                <Path
                  d={task.signoff.path}
                  stroke={colors.foreground}
                  strokeWidth={2.5}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </View>
          ) : null}
          {!!task.signoff.name && (
            <Text style={styles.signedName}>{task.signoff.name}</Text>
          )}
          {!!task.signoff.signedAt && (
            <Text style={styles.muted}>
              {dateTimeOf(task.signoff.signedAt)}
            </Text>
          )}
        </Card>
      )}

      {!!task.note && (
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>
            Note from {doerName ?? "the doer"}
          </Text>
          <Text style={styles.noteText}>{task.note}</Text>
        </Card>
      )}

      {!!inspection && inspection.decidedAt && (
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Inspection</Text>
          <View style={styles.inspectionRow}>
            <Text style={styles.score}>{inspection.score ?? "-"}</Text>
            <Text style={styles.muted}>
              {inspection.status === "passed"
                ? "Passed"
                : humanStatus(inspection.status)}
              {" - "}
              {dateTimeOf(inspection.decidedAt)}
            </Text>
          </View>
          {!!inspection.comments && (
            <Text style={styles.noteText}>{inspection.comments}</Text>
          )}
        </Card>
      )}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Checklist</Text>
        <Text style={styles.muted}>
          {doneCount} of {countable.length} done
        </Text>
      </View>
      <Card style={styles.card}>
        {task.checklist.length === 0 && (
          <Text style={styles.muted}>No checklist items.</Text>
        )}
        {isSectioned(task.checklist)
          ? groupChecklist(task.checklist).map((group) => (
              <View key={group.key || "general"} style={styles.group}>
                <View style={styles.groupHeader}>
                  <Text style={styles.groupTitle}>
                    {group.name ?? "General"}
                  </Text>
                  <Text
                    style={group.complete ? styles.groupDone : styles.muted}
                  >
                    {group.complete
                      ? "Complete"
                      : `${group.done} of ${group.total}`}
                  </Text>
                </View>
                {group.items.map(row)}
              </View>
            ))
          : task.checklist.map(row)}
      </Card>

      {loose.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Other photos ({loose.length})</Text>
          <Card style={styles.card}>
            <View style={styles.photoRow}>{loose.map(thumb)}</View>
          </Card>
        </>
      )}

      <Modal
        visible={viewing !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setViewing(null)}
      >
        <Pressable
          style={styles.viewerBackdrop}
          onPress={() => setViewing(null)}
        >
          {viewing && (
            <Image
              source={{ uri: viewing.uri }}
              style={styles.viewerImage}
              resizeMode="contain"
            />
          )}
          <Text style={styles.viewerLabel}>{viewing?.label}</Text>
          <Text style={styles.viewerHint}>Tap anywhere to close</Text>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function Fact({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.fact}>
      <Ionicons name={icon} size={16} color={colors.mutedForeground} />
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    banner: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      marginBottom: spacing.md,
    },
    bannerText: { flex: 1 },
    bannerTitle: { fontSize: typography.h2, fontWeight: "800" },
    bannerSub: { fontSize: typography.small, color: colors.mutedForeground },
    card: { marginBottom: spacing.md, gap: spacing.sm },
    fact: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    factLabel: {
      width: 78,
      fontSize: typography.small,
      color: colors.mutedForeground,
    },
    factValue: {
      flex: 1,
      fontSize: typography.body,
      color: colors.foreground,
      fontWeight: "500",
      textTransform: "capitalize",
    },
    sectionTitle: {
      fontSize: typography.h2,
      fontWeight: "700",
      color: colors.foreground,
    },
    sectionHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "baseline",
      marginBottom: spacing.xs,
    },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    signature: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.background,
      paddingHorizontal: spacing.sm,
    },
    signedName: {
      fontSize: typography.body,
      fontWeight: "700",
      color: colors.foreground,
    },
    noteText: {
      fontSize: typography.body,
      color: colors.foreground,
      lineHeight: 20,
    },
    inspectionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    score: { fontSize: 28, fontWeight: "800", color: colors.primary },
    group: { gap: spacing.sm, marginBottom: spacing.sm },
    groupHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    groupTitle: {
      fontSize: typography.small,
      fontWeight: "800",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    groupDone: {
      fontSize: typography.small,
      color: colors.success,
      fontWeight: "600",
    },
    item: { gap: spacing.xs, paddingVertical: spacing.xs },
    itemRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm,
    },
    itemBody: { flex: 1, gap: 2 },
    itemLabel: {
      fontSize: typography.body,
      color: colors.foreground,
      fontWeight: "500",
    },
    itemValue: {
      fontSize: typography.small,
      color: colors.mutedForeground,
      fontStyle: "italic",
    },
    noteBox: {
      backgroundColor: colors.secondary,
      borderRadius: radius.md,
      padding: spacing.sm,
      gap: 2,
      marginTop: 2,
    },
    noteTag: {
      fontSize: typography.tiny,
      fontWeight: "800",
      color: colors.mutedForeground,
      letterSpacing: 0.5,
    },
    photoRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
      paddingLeft: 26,
    },
    thumbWrap: { width: 80, gap: 2 },
    thumb: { width: 80, height: 80, borderRadius: radius.md },
    thumbEmpty: { backgroundColor: colors.secondary },
    thumbLabel: {
      fontSize: typography.tiny,
      color: colors.mutedForeground,
      textTransform: "capitalize",
    },
    viewerBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.92)",
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.md,
    },
    viewerImage: { width: "100%", height: "78%" },
    viewerLabel: {
      color: colors.white,
      marginTop: spacing.md,
      fontSize: typography.body,
      fontWeight: "600",
    },
    viewerHint: {
      color: "rgba(255,255,255,0.6)",
      marginTop: 4,
      fontSize: typography.small,
    },
  }),
);
