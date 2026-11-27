import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "@/components/Button";
import { SelectField } from "@/components/SelectField";
import { appAlert } from "@/components/Dialog";
import { updateSite, updateUser } from "@/api/client";
import { assignableManagementRoles } from "@/domain/managerRanks";
import { siteOwnerIds } from "@/domain/teamGroups";
import { roleLabel } from "@/features/roles";
import type { DemoUser, Site, StaffRole } from "@/types/smartclean";
import { colors, radius, spacing, themedStyles, typography, useThemeVersion } from "@/theme";

/**
 * Edit someone's role, site and status from the Team tab, as the web Users page does. Role choices are the actor's own
 * level and below (domain/managerRanks, mirroring the backend); the server refuses the rest regardless.
 *
 * The backend replaces the whole stored record on PUT, so everything not edited here is sent back as it came.
 */

type SiteLite = { id: string; name: string; ownerIds: string[] };

const needsSingleSite = (role: string) => role !== "org_admin" && role !== "operations_manager";
const STATUSES = ["Active", "Suspended", "Inactive"];

export function TeamMemberEditor({
  user,
  actorRole,
  accessToken,
  staffRoles,
  tableServiceEnabled,
  sites,
  onClose,
  onSaved,
}: {
  /** The person being edited, or null when the sheet is closed. */
  user: DemoUser | null;
  actorRole: string | undefined;
  accessToken: string | null;
  staffRoles: StaffRole[];
  tableServiceEnabled: boolean;
  sites: Site[];
  onClose: () => void;
  /** Called with what changed, so the roster updates without a refetch. */
  onSaved: (patch: Partial<DemoUser> & { status: string }) => void;
}) {
  useThemeVersion();
  const insets = useSafeAreaInsets();
  const raw = user as (DemoUser & { username?: string; status?: string }) | null;
  const [roleKey, setRoleKey] = useState("");
  const [siteId, setSiteId] = useState("");
  const [ownedIds, setOwnedIds] = useState<string[]>([]);
  const [status, setStatus] = useState("Active");
  const [saving, setSaving] = useState(false);

  const siteList: SiteLite[] = useMemo(
    () =>
      sites.map((s) => ({
        id: s.id,
        name: s.name,
        ownerIds: siteOwnerIds(s as unknown as { ownerId?: string | null; ownerIds?: string[] }),
      })),
    [sites],
  );
  const ownedBefore = useMemo(
    () => (user ? siteList.filter((s) => s.ownerIds.includes(user.id)).map((s) => s.id) : []),
    [siteList, user],
  );

  // The roles the actor may pick, plus the person's current one so the field never shows blank.
  const roles = useMemo(() => {
    const field = (staffRoles ?? [])
      .filter((r) => !r.features?.tables || tableServiceEnabled)
      .map((r) => ({ key: r.key, label: r.label }));
    const list = [...field, ...assignableManagementRoles(actorRole)];
    if (user && !list.some((r) => r.key === user.role)) list.push({ key: user.role, label: roleLabel(staffRoles, user.role) });
    return list;
  }, [staffRoles, tableServiceEnabled, actorRole, user]);

  useEffect(() => {
    if (!user) return;
    setRoleKey(user.role);
    setSiteId(user.siteIds?.[0] ?? "");
    setOwnedIds(user.role === "operations_manager" ? ownedBefore : []);
    setStatus(raw?.status ?? "Active");
    // Reset only when a different person opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (!user) return null;

  function changeRole(next: string) {
    // Becoming an operations manager starts from the sites they already have; leaving it hands back a single site.
    if (next === "operations_manager" && roleKey !== "operations_manager") {
      setOwnedIds(Array.from(new Set([...ownedBefore, ...(user?.siteIds ?? [])].filter((id) => siteList.some((s) => s.id === id)))));
    } else if (roleKey === "operations_manager" && next !== "operations_manager") {
      setSiteId((cur) => cur || ownedBefore[0] || user?.siteIds?.[0] || "");
    }
    setRoleKey(next);
  }

  async function save() {
    if (!user || !accessToken) return;
    const single = needsSingleSite(roleKey);
    if (single && !siteId) {
      appAlert("Choose a site", "This role works at one site.");
      return;
    }
    setSaving(true);
    try {
      const siteIds = single ? [siteId] : [];
      await updateUser(accessToken, user.id, {
        ...raw,
        displayName: user.name,
        username: raw?.username ?? user.email ?? user.id,
        email: user.email ?? `${user.id}@smartclean.local`,
        role: roleKey,
        status,
        siteIds,
      });
      // An operations manager's sites hang off the site's owners; anyone else owns none.
      const after = roleKey === "operations_manager" ? ownedIds : [];
      let ownershipFailed = false;
      try {
        const ownersOf = (id: string) => siteList.find((s) => s.id === id)?.ownerIds ?? [];
        for (const id of after.filter((id) => !ownedBefore.includes(id))) {
          await updateSite(accessToken, id, { geofence: { ownerIds: Array.from(new Set([...ownersOf(id), user.id])) } });
        }
        for (const id of ownedBefore.filter((id) => !after.includes(id))) {
          await updateSite(accessToken, id, { geofence: { ownerIds: ownersOf(id).filter((o) => o !== user.id) } });
        }
      } catch {
        ownershipFailed = true;
      }
      onSaved({ role: roleKey as DemoUser["role"], status, siteIds });
      onClose();
      appAlert(
        ownershipFailed ? "Saved, but not their sites" : "Saved",
        ownershipFailed ? `${user.name}'s role was saved, but updating the sites they own failed. Open Edit to check them.` : `${user.name} was updated.`,
      );
    } catch (err) {
      appAlert("Could not save", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={() => !saving && onClose()}>
      <Pressable style={styles.backdrop} onPress={() => !saving && onClose()}>
        <Pressable style={[styles.sheet, { paddingBottom: spacing.xl + insets.bottom }]} onPress={() => undefined}>
          <View style={styles.grab} />
          <Text style={styles.title}>Edit {user.name}</Text>
          <SelectField
            label="Role"
            value={roles.find((r) => r.key === roleKey)?.label ?? roleLabel(staffRoles, roleKey)}
            options={roles.map((r) => r.label)}
            onChange={(label) => changeRole(roles.find((r) => r.label === label)?.key ?? roleKey)}
          />
          {roleKey === "operations_manager" ? (
            <View style={styles.field}>
              <Text style={styles.label}>Sites they own</Text>
              <ScrollView style={styles.ownedBox} nestedScrollEnabled>
                {siteList.length === 0 && <Text style={styles.muted}>No sites yet</Text>}
                {siteList.map((site) => {
                  const on = ownedIds.includes(site.id);
                  return (
                    <Pressable
                      key={site.id}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      onPress={() => setOwnedIds(on ? ownedIds.filter((id) => id !== site.id) : [...ownedIds, site.id])}
                      style={styles.ownedRow}
                    >
                      <Ionicons name={on ? "checkbox" : "square-outline"} size={22} color={on ? colors.primary : colors.mutedForeground} />
                      <Text style={styles.ownedName} numberOfLines={1}>
                        {site.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : roleKey === "org_admin" ? (
            <View style={styles.field}>
              <Text style={styles.label}>Site</Text>
              <Text style={styles.muted}>All sites (the whole organisation)</Text>
            </View>
          ) : (
            <SelectField
              label="Site"
              value={siteList.find((s) => s.id === siteId)?.name ?? "Choose a site"}
              options={siteList.map((s) => s.name)}
              onChange={(name) => setSiteId(siteList.find((s) => s.name === name)?.id ?? siteId)}
            />
          )}
          <SelectField label="Status" value={status} options={Array.from(new Set([...STATUSES, status]))} onChange={setStatus} />
          <View style={styles.buttons}>
            <View style={styles.half}>
              <Button variant="outline" disabled={saving} onPress={onClose}>
                Cancel
              </Button>
            </View>
            <View style={styles.half}>
              <Button loading={saving} onPress={save}>
                Save
              </Button>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: radius.xl + 8,
      borderTopRightRadius: radius.xl + 8,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    grab: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.sm },
    title: { fontSize: typography.h2, fontWeight: "700", color: colors.foreground },
    field: { gap: 6 },
    label: { fontSize: typography.small + 1, color: colors.mutedForeground },
    muted: { fontSize: typography.small + 1, color: colors.mutedForeground },
    ownedBox: { maxHeight: 132, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md },
    ownedRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 44 },
    ownedName: { flex: 1, fontSize: typography.body, color: colors.foreground },
    buttons: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
    half: { flex: 1 },
  }),
);
