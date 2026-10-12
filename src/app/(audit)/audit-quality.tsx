import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { StatusBadge } from "@/components/StatusBadge";
import { useSmartClean } from "@/features/store";
import { humanStatus, toneForInspection } from "@/domain/status";
import { colors, spacing, typography, themedStyles, useThemeVersion } from "@/theme";
import type { Inspection } from "@/types/smartclean";

/**
 * The inspection record, as evidence.
 *
 * An auditor's version of the supervisor's Inspections tab, with the
 * decisions removed: a supervisor opens an inspection to pass or fail
 * it, an auditor opens this to see what was decided and when. Read-only
 * throughout - the backend refuses an auditor's writes, so offering a
 * decision here would only produce a 403.
 *
 * This tab is hidden entirely when the organisation's plan omits the
 * inspections module (see the group's _layout.tsx), so this screen can
 * assume the module is on and treat an empty list as "none recorded yet"
 * rather than "not purchased".
 */
export default function AuditQuality() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { state } = useSmartClean();

  // Newest first: an auditor reads the record backwards from now.
  // decidedAt if it has been decided, createdAt otherwise, so a pending
  // inspection sorts by when it was raised rather than falling to the
  // bottom with no date at all.
  const inspections = useMemo(
    () =>
      [...state.inspections].sort(
        (a, b) =>
          new Date(b.decidedAt ?? b.createdAt).getTime() -
          new Date(a.decidedAt ?? a.createdAt).getTime(),
      ),
    [state.inspections],
  );

  const passed = inspections.filter((i) => i.status === "passed").length;
  const failed = inspections.filter((i) =>
    ["failed", "reinspection_required"].includes(i.status),
  ).length;

  return (
    <Screen title="Quality">
      <View style={styles.tiles}>
        <Card style={styles.tile}>
          <Text style={styles.tileLabel}>Passed</Text>
          <Text style={[styles.tileValue, styles.pass]}>{passed}</Text>
        </Card>
        <Card style={styles.tile}>
          <Text style={styles.tileLabel}>Failed</Text>
          <Text style={[styles.tileValue, failed > 0 && styles.fail]}>{failed}</Text>
        </Card>
      </View>

      {inspections.length === 0 ? (
        <Card>
          <Text style={styles.muted}>
            No inspections recorded yet. Completed work that has been reviewed will appear
            here.
          </Text>
        </Card>
      ) : (
        <View style={styles.list}>
          {inspections.map((inspection) => (
            <InspectionRow key={inspection.id} inspection={inspection} />
          ))}
        </View>
      )}
    </Screen>
  );
}

function InspectionRow({ inspection }: { inspection: Inspection }) {
  const { state } = useSmartClean();
  // An Inspection references its task by id only; the title lives on the
  // Task. Both come from the same bootstrap payload, so a missing task
  // means it was filtered out of this auditor's scope rather than that
  // anything is wrong - fall back to the room name rather than an id an
  // auditor has no use for.
  const task = state.tasks.find((t) => t.id === inspection.taskId);
  const inspector = state.users.find((u) => u.id === inspection.inspectorId);
  const when = inspection.decidedAt ?? inspection.createdAt;

  return (
    <Card style={styles.row}>
      <View style={styles.rowHeader}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {task?.title ?? "Inspection"}
        </Text>
        <StatusBadge tone={toneForInspection(inspection.status)} label={humanStatus(inspection.status)} />
      </View>
      {!!task?.locationName && (
        <Text style={styles.muted} numberOfLines={1}>
          {task.locationName}
        </Text>
      )}
      <View style={styles.rowMeta}>
        <Text style={styles.muted}>
          {new Date(when).toLocaleDateString("en-ZA", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        </Text>
        {inspection.score !== undefined && (
          <Text style={styles.score}>Score {inspection.score}</Text>
        )}
      </View>
      {!!inspector && <Text style={styles.muted}>Inspected by {inspector.name}</Text>}
      {!!inspection.comments && <Text style={styles.comments}>{inspection.comments}</Text>}
    </Card>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  tiles: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  tile: {
    flex: 1,
    gap: 2,
  },
  tileLabel: {
    fontSize: typography.small,
    color: colors.mutedForeground,
  },
  tileValue: {
    fontSize: typography.title,
    fontWeight: "800",
    color: colors.foreground,
  },
  pass: {
    color: colors.success,
  },
  fail: {
    color: colors.destructive,
  },
  list: {
    gap: spacing.sm,
  },
  row: {
    gap: spacing.xs,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  rowTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: typography.body,
    fontWeight: "700",
    color: colors.foreground,
  },
  rowMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  score: {
    fontSize: typography.small,
    fontWeight: "700",
    color: colors.primary,
  },
  comments: {
    marginTop: 2,
    fontSize: typography.small,
    color: colors.foreground,
    lineHeight: 18,
  },
  muted: {
    fontSize: typography.small,
    color: colors.mutedForeground,
  },
}));
