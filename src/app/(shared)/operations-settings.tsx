import { useEffect, useMemo, useState } from "react";
import { Redirect } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Screen } from "@/components/Screen";
import { OperatingDaysSetup } from "@/components/OperatingDaysSetup";
import { RoleScopeSetup } from "@/components/RoleScopeSetup";
import { PublicHolidaysSetup } from "@/components/PublicHolidaysSetup";
import { WorkingHoursSetup } from "@/components/WorkingHoursSetup";
import { getOrgOperations, type OrgOperations } from "@/api/client";
import { fuzzyFilter } from "@/domain/fuzzySearch";
import { useHomePath } from "@/features/roles";
import { useSmartClean } from "@/features/store";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

const ORG = "org";
const SEARCH_FROM = 6;
const SECTIONS = [
  ["days", "Operating days"],
  ["hours", "Working hours"],
  ["holidays", "Public holidays"],
  ["roles", "Staff roles"],
] as const;
type Section = (typeof SECTIONS)[number][0];
const MANAGERS = ["org_admin", "operations_manager", "site_manager", "supervisor"];

/**
 * Organisation and site settings: the facts every module reads about when a place operates. The organisation sets a
 * default and a site changes it only where it differs. It belongs to no feature module, so it is always available to
 * the people who run the organisation and its sites. The same page as the web app's Set up > Organisation and site
 * settings.
 */
export default function OperationsSettingsScreen() {
  useThemeVersion();
  const { state, currentUser } = useSmartClean();
  const token = state.accessToken;
  const homePath = useHomePath();
  const allowed = !!currentUser && MANAGERS.includes(currentUser.role);
  const canEditOrg = currentUser?.role === "org_admin" || currentUser?.role === "operations_manager";
  const sites = useMemo(() => {
    const active = state.sites.filter((s) => s.active);
    // The server decides who may save; this only chooses which sites to offer.
    if (currentUser?.role === "org_admin" || currentUser?.role === "operations_manager") return active;
    return active.filter((s) => currentUser?.siteIds?.includes(s.id));
  }, [state.sites, currentUser]);
  const [org, setOrg] = useState<OrgOperations | null>(null);
  const [scope, setScope] = useState<string>(canEditOrg ? ORG : (sites[0]?.id ?? ORG));
  const [section, setSection] = useState<Section>("days");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!token || !allowed) return;
    getOrgOperations(token)
      .then(setOrg)
      .catch(() => setOrg(null));
  }, [token, allowed]);
  // A manager whose sites load after the screen opens starts on the first of them.
  useEffect(() => {
    if (!canEditOrg && scope === ORG && sites[0]) setScope(sites[0].id);
  }, [canEditOrg, scope, sites]);

  if (!allowed) return <Redirect href={homePath as never} />;

  const site = scope === ORG ? undefined : sites.find((s) => s.id === scope);
  const shown = sites.length > SEARCH_FROM ? fuzzyFilter(sites, query, (s) => [s.name, s.address]) : sites;

  return (
    <Screen title="Organisation and site settings">
      <Text style={styles.muted}>Set how the organisation operates, then change a site only where it differs. Sites follow the organisation unless they have their own value.</Text>
      {sites.length > SEARCH_FROM && (
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Find a site"
          placeholderTextColor={colors.mutedForeground}
          accessibilityLabel="Find a site"
        />
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: scope === ORG }} style={[styles.chip, scope === ORG && styles.chipOn]} onPress={() => setScope(ORG)}>
          <Text style={[styles.chipText, scope === ORG && styles.chipTextOn]}>Organisation</Text>
        </Pressable>
        {shown.map((s) => (
          <Pressable key={s.id} accessibilityRole="button" accessibilityState={{ selected: scope === s.id }} style={[styles.chip, scope === s.id && styles.chipOn]} onPress={() => setScope(s.id)}>
            <Text style={[styles.chipText, scope === s.id && styles.chipTextOn]}>{s.name}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.tabs} accessibilityRole="tablist">
        {SECTIONS.map(([id, label]) => (
          <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected: section === id }} onPress={() => setSection(id)} style={[styles.tab, section === id && styles.tabOn]}>
            <Text style={[styles.tabText, section === id && styles.tabTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.scopeName}>{site ? site.name : "Organisation default"}</Text>
      {section === "days" && <OperatingDaysSetup key={`days-${scope}`} site={site} org={org} canEditOrg={canEditOrg} onOrgSaved={setOrg} />}
      {section === "hours" && <WorkingHoursSetup key={`hours-${scope}`} site={site} org={org} canEditOrg={canEditOrg} onOrgSaved={setOrg} />}
      {section === "roles" && <RoleScopeSetup key={`roles-${scope}`} site={site} canEdit={canEditOrg} onOpenSite={setScope} />}
      {section === "holidays" && <PublicHolidaysSetup key={`holidays-${scope}`} site={site} org={org} readOnly={!canEditOrg} onManage={canEditOrg && site ? () => setScope(ORG) : undefined} />}
    </Screen>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    muted: { fontSize: typography.small, color: colors.mutedForeground, marginBottom: spacing.sm },
    scopeName: { fontSize: typography.small, fontWeight: "700", color: colors.mutedForeground, textTransform: "uppercase", marginVertical: spacing.sm },
    chips: { gap: spacing.xs, paddingBottom: spacing.sm },
    chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.round, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: typography.small, fontWeight: "600", color: colors.foreground },
    chipTextOn: { color: colors.primaryForeground },
    tabs: { flexDirection: "row", gap: spacing.xs, padding: spacing.xs, borderRadius: radius.round, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    tab: { flex: 1, alignItems: "center", paddingVertical: spacing.sm, borderRadius: radius.round },
    tabOn: { backgroundColor: colors.primary },
    tabText: { fontSize: typography.small, fontWeight: "700", color: colors.mutedForeground },
    tabTextOn: { color: colors.primaryForeground },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.card, color: colors.foreground, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 16, minHeight: 44, marginBottom: spacing.sm },
  }),
);
