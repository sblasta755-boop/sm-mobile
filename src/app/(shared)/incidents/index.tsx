import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { StatusBadge } from "@/components/StatusBadge";
import { useSmartClean } from "@/features/store";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion, type StatusTone } from "@/theme";

const TONE: Record<string, StatusTone> = { critical: "destructive", high: "warning", medium: "info", low: "muted" };
const isOpen = (s: string) => !["resolved", "closed"].includes(s);
const words = (s: string) => s.replace(/_/g, " ");

/** The incident list behind the manager Overview's "Open incidents" card. The web app's phone version is ManageIncidentsMobile. */
export default function IncidentsListScreen() {
  useThemeVersion();
  const { state } = useSmartClean();
  const [show, setShow] = useState<"open" | "all">("open");
  const [openId, setOpenId] = useState<string | null>(null);
  const list = state.incidents
    .filter((i) => show === "all" || isOpen(i.status))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const openCount = state.incidents.filter((i) => isOpen(i.status)).length;
  const siteName = (id: string) => state.sites.find((s) => s.id === id)?.name ?? "";

  return (
    <Screen title="Incidents">
      <View style={styles.seg}>
        {([["open", `Open (${openCount})`], ["all", `All (${state.incidents.length})`]] as const).map(([key, label]) => (
          <Pressable key={key} accessibilityRole="button" onPress={() => setShow(key)} style={[styles.segBtn, show === key && styles.segOn]}>
            <Text style={[styles.segText, show === key && styles.segTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {list.length === 0 ? (
        <Text style={styles.empty}>{show === "open" ? "No open incidents." : "No incidents yet."}</Text>
      ) : (
        list.map((i) => {
          const expanded = openId === i.id;
          return (
            <Pressable key={i.id} accessibilityRole="button" onPress={() => setOpenId(expanded ? null : i.id)} style={styles.card}>
              <View style={styles.head}>
                <Ionicons name="warning-outline" size={16} color={colors.warningForeground} />
                <Text style={styles.title} numberOfLines={1}>{words(i.category)}</Text>
                <StatusBadge tone={TONE[i.priority] ?? "muted"} label={i.priority} />
              </View>
              <Text style={styles.muted}>{[siteName(i.siteId), i.locationName].filter(Boolean).join(" · ")}</Text>
              <Text style={styles.desc} numberOfLines={expanded ? undefined : 2}>{i.description}</Text>
              <Text style={styles.muted}>
                {words(i.status)} · {new Date(i.createdAt).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </Text>
            </Pressable>
          );
        })
      )}
    </Screen>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    seg: { flexDirection: "row", padding: 4, gap: 4, borderRadius: radius.round, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, marginBottom: spacing.md },
    segBtn: { flex: 1, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.round },
    segOn: { backgroundColor: colors.primary },
    segText: { fontSize: typography.body, fontWeight: "700", color: colors.mutedForeground },
    segTextOn: { color: colors.primaryForeground },
    empty: { padding: spacing.lg, borderRadius: radius.xl, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, color: colors.mutedForeground, fontSize: typography.small },
    card: { backgroundColor: colors.card, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm, marginBottom: spacing.md },
    head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    title: { flex: 1, fontSize: typography.body, fontWeight: "800", color: colors.foreground, textTransform: "capitalize" },
    desc: { fontSize: typography.body, color: colors.foreground },
    muted: { fontSize: typography.small, color: colors.mutedForeground, textTransform: "none" },
  }),
);
