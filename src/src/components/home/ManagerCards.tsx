import { useState } from "react";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { hoursText } from "@/domain/workingHours";
import { BarRows, PillSelector, StackedBar } from "@/components/PlatformHomeKit";
import { tourTargetRef } from "@/features/tour";
import type { Glyph, ManagerOverviewData } from "@/features/managerOverview";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

/**
 * The cards of the manager's Overview, one component each so the home can order and hide them. They are the
 * sections of the screen as it was before customising (design M-1, docs/design/manager-home-options), moved here
 * unchanged. Each decides for itself whether it has anything to show; the layout only orders and hides.
 */

type View3 = "tasks" | "people" | "issues";

/** "45m late", "3h late", "2d late". */
function lateness(iso: string, now = Date.now()): string {
  const minutes = Math.max(1, Math.floor((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m late`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h late`;
  return `${Math.floor(hours / 24)}d late`;
}

function Label({ icon, text }: { icon: Glyph; text: string }) {
  return (
    <View style={styles.label}>
      <Ionicons name={icon} size={16} color={colors.mutedForeground} />
      <Text style={styles.labelText}>{text}</Text>
    </View>
  );
}

export function NoSitesWarning() {
  useThemeVersion();
  return (
    <View style={[styles.card, styles.warning]}>
      <Ionicons name="information-circle" size={20} color={colors.warningForeground} />
      <View style={{ flex: 1 }}>
        <Text style={styles.warningTitle}>No sites assigned yet</Text>
        <Text style={styles.warningText}>
          Your account isn&apos;t linked to a site, so there&apos;s nothing to show here yet. Ask your administrator to
          assign you one.
        </Text>
      </View>
    </View>
  );
}

/** The pill selector over one big card: Tasks, People or Issues. The choice is local to this card. */
export function SummaryCard({ data }: { data: ManagerOverviewData }) {
  useThemeVersion();
  const [view, setView] = useState<View3>("tasks");
  const { mySites, openTasks, overdue, onShift, onShiftBySite, openIncidents, openActions } = data;
  const total = openTasks.length;
  return (
    <>
      <PillSelector
        value={view}
        onChange={setView}
        options={[
          { value: "tasks", label: "Tasks", icon: "list-outline" },
          { value: "people", label: "People", icon: "people-outline" },
          { value: "issues", label: "Issues", icon: "warning-outline" },
        ]}
      />

      <View style={[styles.card, { marginTop: spacing.md }]}>
        {view === "tasks" ? (
          <>
            <Label icon="list-outline" text="Open tasks" />
            <Text style={styles.big}>
              {total}
              <Text style={styles.unit}>
                {"  "}across {mySites.length} site{mySites.length === 1 ? "" : "s"}
              </Text>
            </Text>
            <View style={{ marginTop: spacing.lg }}>
              <StackedBar
                parts={[
                  { label: "Overdue", value: overdue.length, tone: "bad" },
                  { label: "On time", value: total - overdue.length, tone: "good" },
                ]}
              />
            </View>
          </>
        ) : view === "people" ? (
          <>
            <Label icon="people-outline" text="On shift now" />
            <Text style={styles.big}>
              {onShift.length}
              <Text style={styles.unit}>  clocked in</Text>
            </Text>
            {mySites.length > 0 ? (
              <View style={{ marginTop: spacing.lg }}>
                <BarRows rows={mySites.slice(0, 5).map((s) => ({ label: s.name, value: onShiftBySite(s.id), tone: "primary" }))} />
              </View>
            ) : null}
          </>
        ) : (
          <>
            <Label icon="warning-outline" text="Open issues" />
            <Text style={styles.big}>
              {openIncidents.length + openActions.length}
              <Text style={styles.unit}>  to deal with</Text>
            </Text>
            <View style={{ marginTop: spacing.lg }}>
              <BarRows
                rows={[
                  { label: "Incidents", value: openIncidents.length, tone: "warn" },
                  { label: "Corrective", value: openActions.length, tone: "bad" },
                ]}
              />
            </View>
          </>
        )}
      </View>
    </>
  );
}

/** `half`: it sits beside another card in a row, so it shares the width. */
export function OnShiftCard({ data, half }: { data: ManagerOverviewData; half?: boolean }) {
  useThemeVersion();
  const { onShift, mySites, staffedSites } = data;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push("/attendance" as never)}
      style={[styles.card, half && styles.half]}
    >
      <Label icon="people-outline" text="On shift now" />
      <Text style={styles.big}>{onShift.length}</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${mySites.length ? (staffedSites / mySites.length) * 100 : 0}%`, backgroundColor: colors.success }]} />
      </View>
      <Text style={styles.sub}>{onShift.length === 0 ? "Nobody clocked in yet" : `At ${staffedSites} of ${mySites.length} sites`}</Text>
    </Pressable>
  );
}

export function IncidentsCard({ data, half }: { data: ManagerOverviewData; half?: boolean }) {
  useThemeVersion();
  const { openIncidents, openActions } = data;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push("/incidents" as never)}
      style={[styles.card, half && styles.half]}
    >
      <Label icon="warning-outline" text="Open incidents" />
      <Text style={[styles.big, openIncidents.length > 0 && { color: colors.warningForeground }]}>{openIncidents.length}</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: openIncidents.length > 0 ? "100%" : "0%", backgroundColor: colors.warning }]} />
      </View>
      <Text style={styles.sub}>
        {openActions.length} corrective action{openActions.length === 1 ? "" : "s"}
      </Text>
    </Pressable>
  );
}

/** Two cards side by side, as the screen has always shown On shift now and Open incidents. */
export function Pair({ children }: { children: React.ReactNode }) {
  return <View style={styles.pair}>{children}</View>;
}

export function ShortcutsCard({ data }: { data: ManagerOverviewData }) {
  useThemeVersion();
  const { shortcuts } = data;
  if (shortcuts.length === 0) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipsWrap}>
      {shortcuts.map((s) => (
        <Pressable
          key={s.key}
          ref={tourTargetRef(`tile:${s.key}`)}
          accessibilityRole="button"
          onPress={() => router.push(s.to as never)}
          style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name={s.icon} size={16} color={colors.primary} />
          <Text style={styles.chipText}>{s.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export function OverdueCard({ data }: { data: ManagerOverviewData }) {
  useThemeVersion();
  const { overdue } = data;
  if (overdue.length === 0) return null;
  return (
    <>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Overdue tasks</Text>
        <Pressable accessibilityRole="button" onPress={() => router.push("/kanban")}>
          <Text style={styles.link}>View all {overdue.length}</Text>
        </Pressable>
      </View>
      <View style={[styles.card, styles.listCard]}>
        {overdue.slice(0, 3).map((task, i) => (
          <Pressable
            key={task.id}
            accessibilityRole="button"
            onPress={() => router.push(`/tasks/${task.id}`)}
            style={[styles.row, i > 0 && styles.divider]}
          >
            <View style={[styles.disc, { backgroundColor: colors.destructiveSoft }]}>
              <Ionicons name="time-outline" size={16} color={colors.destructive} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {task.title}
              </Text>
              <Text style={styles.sub} numberOfLines={1}>
                {task.locationName}
              </Text>
            </View>
            <View style={[styles.tag, { backgroundColor: colors.destructiveSoft }]}>
              <Text style={[styles.tagText, { color: colors.destructive }]}>{lateness(task.scheduledAt!)}</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </>
  );
}

export function SitesCard({ data }: { data: ManagerOverviewData }) {
  useThemeVersion();
  const { mySites, onShiftBySite, layoutOn } = data;
  return (
    <>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Your sites</Text>
        <Text style={styles.link}>{mySites.length}</Text>
      </View>
      <View style={[styles.card, styles.listCard]}>
        {mySites.length === 0 ? (
          <Text style={[styles.sub, { paddingVertical: spacing.md }]}>No sites to show.</Text>
        ) : (
          mySites.map((site, i) => {
            // The live floor plan is an Enterprise feature for managers; a site with no floors has nothing to show.
            const hasPlan = layoutOn && (site.profile?.floors?.length ?? 0) > 0;
            const content = (
              <>
                <View style={[styles.disc, { backgroundColor: colors.accent }]}>
                  <Ionicons name="business-outline" size={16} color={colors.primary} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {site.name}
                  </Text>
                  <Text style={styles.sub} numberOfLines={1}>
                    {site.workingHours ? `Open ${hoursText(site.workingHours, "–")} · ` : ""}
                    {onShiftBySite(site.id)} on shift
                  </Text>
                </View>
                {hasPlan && (
                  <View style={styles.planLink}>
                    <Text style={styles.link}>Floor plan</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                  </View>
                )}
              </>
            );
            return hasPlan ? (
              <Pressable
                key={site.id}
                accessibilityRole="button"
                accessibilityLabel={`${site.name} floor plan`}
                onPress={() => router.push({ pathname: "/site-floor", params: { siteId: site.id } } as never)}
                style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && { opacity: 0.7 }]}
              >
                {content}
              </Pressable>
            ) : (
              <View key={site.id} style={[styles.row, i > 0 && styles.divider]}>
                {content}
              </View>
            );
          })
        )}
      </View>
    </>
  );
}

export function AddMemberCard({ data }: { data: ManagerOverviewData }) {
  useThemeVersion();
  if (data.currentUser?.canOnboardStaff === false) return null;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push("/manage-add-staff")}
      style={({ pressed }) => [styles.card, styles.cta, pressed && { opacity: 0.8 }]}
    >
      <View style={[styles.disc, { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.accent }]}>
        <Ionicons name="person-add-outline" size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>Add a team member</Text>
        <Text style={styles.sub}>Create their account and show them a QR code - no email needed.</Text>
      </View>
      <Ionicons name="arrow-forward" size={18} color={colors.foreground} />
    </Pressable>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.xl + 6,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      marginBottom: spacing.sm + 2,
    },
    label: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    labelText: { fontSize: typography.small + 1, color: colors.mutedForeground },
    big: { fontSize: 36, fontWeight: "300", color: colors.foreground, marginTop: spacing.sm, letterSpacing: -0.5 },
    unit: { fontSize: typography.body, fontWeight: "400", color: colors.mutedForeground },
    pair: { flexDirection: "row", gap: spacing.sm + 2 },
    half: { flex: 1 },
    track: { height: 5, borderRadius: 3, backgroundColor: colors.secondary, marginTop: spacing.md, overflow: "hidden" },
    fill: { height: 5, borderRadius: 3 },
    sub: { fontSize: typography.small, color: colors.mutedForeground, marginTop: 2 },
    chipsWrap: { marginHorizontal: -spacing.lg, marginBottom: spacing.xs },
    chips: { gap: spacing.sm, paddingHorizontal: spacing.lg },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingHorizontal: spacing.md + 2,
      height: 40,
      borderRadius: radius.round,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    chipText: { fontSize: typography.small + 1, fontWeight: "600", color: colors.foreground },
    sectionHead: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "baseline",
      marginTop: spacing.lg,
      marginBottom: spacing.sm + 2,
      paddingHorizontal: 2,
    },
    sectionTitle: { fontSize: typography.h2, fontWeight: "600", color: colors.foreground },
    link: { fontSize: typography.small + 1, color: colors.primary, fontWeight: "600" },
    planLink: { flexDirection: "row", alignItems: "center", gap: 2 },
    listCard: { paddingVertical: 2 },
    row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
    divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    disc: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
    rowTitle: { fontSize: typography.body, fontWeight: "600", color: colors.foreground },
    tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.round },
    tagText: { fontSize: typography.small - 0.5, fontWeight: "700" },
    cta: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.sm },
    warning: { flexDirection: "row", gap: spacing.sm, backgroundColor: colors.warningSoft, borderColor: colors.warning },
    warningTitle: { fontSize: typography.body, fontWeight: "700", color: colors.warningForeground },
    warningText: { fontSize: typography.small, color: colors.warningForeground, lineHeight: 19 },
  }),
);
