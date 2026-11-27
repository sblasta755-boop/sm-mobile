import { useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { RoleScopeField } from "@/components/RoleScopeField";
import { appAlert } from "@/components/Dialog";
import { setRoleScope } from "@/api/client";
import { fuzzyFilter } from "@/domain/fuzzySearch";
import { bookableRoleOptions, scopeFor, type RoleScope } from "@/domain/roleScope";
import { roleLabel } from "@/features/roles";
import { useSmartClean } from "@/features/store";
import type { Site } from "@/types/smartclean";
import { colors, radius, spacing, typography, themedStyles } from "@/theme";

const MANAGES = ["site_manager", "supervisor"];
/** More people than this and the list gets a search box. */
const SEARCH_FROM = 6;

/** "All roles", or "Cleaner (also Waiter)": what a manager books at a site, in words. */
function summary(scope: RoleScope, label: (key: string) => string) {
  if (scope.mode === "all") return "All roles";
  const own = scope.roles.map(label).join(", ");
  const extra = scope.extraRoles.map(label).join(", ");
  return extra ? `${own} (also ${extra})` : own;
}

/**
 * Which staff roles each site manager and supervisor books. At a site it lists the people assigned there and an
 * administrator or operations manager edits each one; at the organisation level it shows who is limited across every
 * site and opens that site to change it. Same as the web app's Staff roles managers book section.
 */
export function RoleScopeSetup({
  site,
  canEdit,
  onOpenSite,
}: {
  /** The site being edited, or undefined for the organisation overview. */
  site?: Site;
  canEdit: boolean;
  onOpenSite: (siteId: string) => void;
}) {
  const { state, dispatch } = useSmartClean();
  const label = (key: string) => roleLabel(state.staffRoles, key);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RoleScope>(scopeFor(undefined, ""));
  const [saving, setSaving] = useState(false);

  const people = useMemo(
    () =>
      state.users.filter(
        (u) =>
          MANAGES.includes(u.role) &&
          ((u as { status?: string }).status ?? "Active") === "Active" &&
          (site ? (u.siteIds ?? []).includes(site.id) : true),
      ),
    [state.users, site],
  );
  const shown = people.length > SEARCH_FROM ? fuzzyFilter(people, query, (u) => [u.name, u.role]) : people;

  async function save(personId: string, name: string) {
    if (!state.accessToken || !site) return;
    if (draft.mode === "roles" && draft.roles.length === 0) return;
    setSaving(true);
    try {
      const updated = await setRoleScope(state.accessToken, personId, site.id, draft);
      dispatch({ type: "UPDATE_USER", userId: personId, patch: updated as never });
      setEditingId(null);
      appAlert("Saved", `${name} was updated.`);
    } catch (err) {
      appAlert("Could not save", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!site) {
    const limited = people.flatMap((person) =>
      (person.siteIds ?? [])
        .map((siteId) => ({ person, siteId, scope: scopeFor(person.roleScopes, siteId) }))
        .filter((row) => row.scope.mode === "roles"),
    );
    return (
      <View style={styles.wrap}>
        <Text style={styles.muted}>
          Site managers and supervisors book every staff role at their site unless they are limited. A limit is set per site: choose a site above to set it.
        </Text>
        {limited.length === 0 ? (
          <Card>
            <Text style={styles.muted}>Nobody is limited. Everyone books all roles at their site.</Text>
          </Card>
        ) : (
          limited.map(({ person, siteId, scope }) => (
            <Card key={`${person.id}-${siteId}`}>
              <Text style={styles.name}>{person.name}</Text>
              <Text style={styles.muted}>
                {state.sites.find((s) => s.id === siteId)?.name ?? siteId}: {summary(scope, label)}
              </Text>
              <Button variant="outline" onPress={() => onOpenSite(siteId)}>
                Open site
              </Button>
            </Card>
          ))
        )}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.muted}>
        Choose which staff roles each person books at {site.name}. Roles they look after are what they see by default; roles they can also book are added when they ask for other roles. Anyone without a limit books every role.
      </Text>
      {people.length > SEARCH_FROM && (
        <View style={styles.search}>
          <Ionicons name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name or role"
            placeholderTextColor={colors.mutedForeground}
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel="Search people"
            style={styles.searchInput}
          />
        </View>
      )}
      {people.length === 0 && (
        <Card>
          <Text style={styles.muted}>No site manager or supervisor is assigned to this site.</Text>
        </Card>
      )}
      {shown.map((person) => {
        const current = scopeFor(person.roleScopes, site.id);
        const open = editingId === person.id;
        return (
          <Card key={person.id}>
            <Text style={styles.name}>{person.name}</Text>
            <Text style={styles.muted}>
              {label(person.role)} · {summary(current, label)}
            </Text>
            {canEdit && !open && (
              <Button
                variant="outline"
                onPress={() => {
                  setEditingId(person.id);
                  setDraft(current);
                }}
              >
                Edit
              </Button>
            )}
            {open && (
              <View style={styles.wrap}>
                <RoleScopeField roles={bookableRoleOptions(state.staffRoles)} value={draft} onChange={setDraft} />
                <View style={styles.buttons}>
                  <View style={styles.half}>
                    <Button variant="outline" disabled={saving} onPress={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </View>
                  <View style={styles.half}>
                    <Button loading={saving} disabled={draft.mode === "roles" && draft.roles.length === 0} onPress={() => save(person.id, person.name)}>
                      Save
                    </Button>
                  </View>
                </View>
              </View>
            )}
          </Card>
        );
      })}
      {people.length > 0 && shown.length === 0 && <Text style={styles.muted}>No one matches &quot;{query}&quot;.</Text>}
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    wrap: { gap: spacing.sm },
    name: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    muted: { fontSize: typography.small + 1, color: colors.mutedForeground },
    search: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md,
      minHeight: 44,
    },
    searchInput: { flex: 1, fontSize: typography.body, color: colors.foreground },
    buttons: { flexDirection: "row", gap: spacing.sm },
    half: { flex: 1 },
  }),
);
