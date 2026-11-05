import { useCallback, useState } from "react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { SelectField } from "@/components/SelectField";
import { StatusBadge } from "@/components/StatusBadge";
import { appAlert } from "@/components/Dialog";
import { useSmartClean } from "@/features/store";
import { orgToken } from "@/features/orgSession";
import {
  deleteUser,
  inviteStaff,
  listOrganisationUsers,
  listUserRecords,
  loadBackendBootstrap,
  unlockUser,
  updateUser,
  type OrganisationUser,
} from "@/api/client";
import { STATE_INFO, formatWhen, initialsOf, roleLabel, userState } from "@/features/orgUsers";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

/** Roles that cover a whole organisation rather than one site; their site and role are not edited here. */
const WHOLE_ORGANISATION = ["org_admin", "operations_manager", "system_admin"];

type EditState = {
  record: Record<string, unknown>;
  /** label -> key, for roles and sites. */
  roles: { key: string; label: string }[];
  sites: { id: string; name: string }[];
  roleKey: string;
  siteId: string;
  status: string;
  fixedRole: boolean;
};

/**
 * One person in an organisation, for the platform operator. What is shown comes from the read-only roster. Changing
 * anything acts inside the organisation as its administrator (see features/orgSession.ts), so it is audited under the
 * operator's own name; that session is only opened when an action is taken.
 */
export default function PlatformOrganisationUser() {
  useThemeVersion();
  const { tenantId, userId } = useLocalSearchParams<{ tenantId: string; userId: string }>();
  const { state } = useSmartClean();
  const [user, setUser] = useState<OrganisationUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!state.accessToken || !tenantId) return;
    try {
      const list = await listOrganisationUsers(state.accessToken, tenantId);
      const found = list.find((u) => u.id === userId) ?? null;
      setUser(found);
      setError(found ? null : "This person is no longer in the organisation.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this person");
    }
  }, [state.accessToken, tenantId, userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const token = () => orgToken(state.accessToken!, tenantId!);
  const backToList = () => router.replace({ pathname: "/platform-org-users/[tenantId]", params: { tenantId: tenantId! } });

  async function rawRecord(t: string): Promise<Record<string, unknown>> {
    const all = await listUserRecords(t);
    const found = all.find((r) => String(r.id) === userId);
    if (!found) throw new Error("Could not find this person's record.");
    return found;
  }

  async function act(key: string, failure: string, work: () => Promise<void>) {
    setBusy(key);
    try {
      await work();
      await load();
    } catch (err) {
      appAlert(failure, err instanceof Error ? err.message : "Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function openEdit() {
    if (!user) return;
    await act("edit", "Could not open the editor", async () => {
      const t = await token();
      const [record, bootstrap] = await Promise.all([rawRecord(t), loadBackendBootstrap(t)]);
      const role = String(record.role ?? user.role);
      const fixedRole = WHOLE_ORGANISATION.includes(role);
      const roles = [
        { key: "site_manager", label: "Site manager" },
        { key: "supervisor", label: "Supervisor" },
        ...(bootstrap.staffRoles ?? []).map((r) => ({ key: r.key, label: r.label })),
      ];
      if (!roles.some((r) => r.key === role)) roles.push({ key: role, label: roleLabel(role) });
      const siteIds = Array.isArray(record.siteIds) ? (record.siteIds as string[]) : [];
      setEdit({
        record,
        roles,
        sites: (bootstrap.sites ?? []).map((s) => ({ id: s.id, name: s.name })),
        roleKey: role,
        siteId: siteIds[0] ?? "",
        status: String(record.status ?? user.status),
        fixedRole,
      });
    });
  }

  async function saveEdit() {
    if (!edit || !user) return;
    if (!edit.fixedRole && !edit.siteId) {
      appAlert("Choose a site", "This role works at one site.");
      return;
    }
    setSaving(true);
    try {
      const t = await token();
      // The backend replaces the whole record, so everything not changed here is sent back as it was.
      await updateUser(t, user.id, {
        ...edit.record,
        role: edit.roleKey,
        status: edit.status,
        siteIds: edit.fixedRole ? (edit.record.siteIds ?? []) : [edit.siteId],
      });
      setEdit(null);
      await load();
      appAlert("Saved", `${user.name} was updated.`);
    } catch (err) {
      appAlert("Could not save", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function setStatus(status: "Inactive" | "Active", done: string) {
    if (!user) return;
    void act(status, "Could not change the status", async () => {
      const t = await token();
      const record = await rawRecord(t);
      await updateUser(t, user.id, { ...record, status });
      appAlert(done, user.name);
    });
  }

  function confirmDelete() {
    if (!user) return;
    appAlert(
      `Delete ${user.name}?`,
      "This permanently removes their account. To keep the record, use Archive instead.",
      [
        { text: "Archive instead", onPress: () => setStatus("Inactive", "Archived") },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            void act("delete", "Could not delete", async () => {
              await deleteUser(await token(), user.id);
              backToList();
            }),
        },
        { text: "Cancel", style: "cancel" },
      ],
      "danger",
    );
  }

  const s = user ? userState(user.status) : "active";
  const info = STATE_INFO[s];

  return (
    <Screen title="User" backTo={`/platform-org-users/${tenantId}`}>
      {error && (
        <View style={styles.card}>
          <Text style={styles.error}>{error}</Text>
        </View>
      )}
      {!user && !error && <Text style={styles.muted}>Loading…</Text>}

      {user && (
        <>
          <View style={[styles.card, styles.top]}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initialsOf(user.name)}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.name} numberOfLines={1}>
                {user.name}
              </Text>
              <Text style={styles.muted} numberOfLines={1}>
                {user.email}
              </Text>
            </View>
            <StatusBadge tone={info.tone} label={info.label} />
          </View>

          <View style={[styles.card, { paddingVertical: spacing.xs }]}>
            <Row label="Role" value={roleLabel(user.role)} />
            <Row label="Status" value={user.status} />
            <Row label="Last sign-in" value={formatWhen(user.lastLogin, true)} />
            <Row label="Added" value={formatWhen(user.createdAt)} last />
          </View>

          <View style={styles.actions}>
            <Button variant="outline" loading={busy === "edit"} onPress={openEdit} icon={<Ionicons name="create-outline" size={18} color={colors.foreground} />}>
              Edit
            </Button>
            {s === "pending" && (
              <Button
                variant="outline"
                loading={busy === "invite"}
                onPress={() =>
                  act("invite", "Could not send the invite", async () => {
                    const result = await inviteStaff(await token(), user.id);
                    appAlert("Invite sent", `An invite was emailed to ${result.email}.`);
                  })
                }
                icon={<Ionicons name="mail-outline" size={18} color={colors.foreground} />}
              >
                Resend invite
              </Button>
            )}
            <Button
              variant="outline"
              loading={busy === "unlock"}
              onPress={() =>
                act("unlock", "Could not unlock", async () => {
                  await unlockUser(await token(), user.id);
                  appAlert("Unlocked", `${user.name} can sign in again.`);
                })
              }
              icon={<Ionicons name="lock-open-outline" size={18} color={colors.foreground} />}
            >
              Unlock account
            </Button>
            {s === "archived" ? (
              <Button variant="outline" loading={busy === "Active"} onPress={() => setStatus("Active", "Reactivated")} icon={<Ionicons name="refresh-outline" size={18} color={colors.foreground} />}>
                Reactivate
              </Button>
            ) : (
              <Button variant="outline" loading={busy === "Inactive"} onPress={() => setStatus("Inactive", "Archived")} icon={<Ionicons name="archive-outline" size={18} color={colors.foreground} />}>
                Archive
              </Button>
            )}
            {user.role === "operations_manager" ? (
              <Text style={styles.note}>
                Operations managers own sites, so they are deleted from the web console, where those sites can be handed over first.
              </Text>
            ) : (
              <Button variant="destructive" loading={busy === "delete"} onPress={confirmDelete} icon={<Ionicons name="trash-outline" size={18} color="#fff" />}>
                Delete
              </Button>
            )}
            <Text style={styles.note}>Changes are made inside the organisation as its administrator and are recorded under your name.</Text>
          </View>
        </>
      )}

      <Modal visible={!!edit} transparent animationType="slide" onRequestClose={() => setEdit(null)}>
        <Pressable style={styles.backdrop} onPress={() => !saving && setEdit(null)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <View style={styles.grab} />
            <Text style={styles.sheetTitle}>Edit {user?.name}</Text>
            {edit && (
              <>
                {edit.fixedRole ? (
                  <View style={styles.fixed}>
                    <Text style={styles.muted}>Role</Text>
                    <Text style={styles.rowValue}>{roleLabel(edit.roleKey)}</Text>
                    <Text style={styles.note}>This role covers the whole organisation. Change it in the web console.</Text>
                  </View>
                ) : (
                  <>
                    <SelectField
                      label="Role"
                      value={edit.roles.find((r) => r.key === edit.roleKey)?.label ?? roleLabel(edit.roleKey)}
                      options={edit.roles.map((r) => r.label)}
                      onChange={(label) => setEdit({ ...edit, roleKey: edit.roles.find((r) => r.label === label)?.key ?? edit.roleKey })}
                    />
                    <SelectField
                      label="Site"
                      value={edit.sites.find((x) => x.id === edit.siteId)?.name ?? "Choose a site"}
                      options={edit.sites.map((x) => x.name)}
                      onChange={(name) => setEdit({ ...edit, siteId: edit.sites.find((x) => x.name === name)?.id ?? edit.siteId })}
                    />
                  </>
                )}
                <SelectField
                  label="Status"
                  value={edit.status}
                  options={Array.from(new Set(["Active", "Inactive", edit.status]))}
                  onChange={(status) => setEdit({ ...edit, status })}
                />
                <View style={styles.sheetButtons}>
                  <View style={{ flex: 1 }}>
                    <Button variant="outline" disabled={saving} onPress={() => setEdit(null)}>
                      Cancel
                    </Button>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button loading={saving} onPress={saveEdit}>
                      Save
                    </Button>
                  </View>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.row, !last && styles.rowDivider]}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
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
    top: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    avatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center" },
    avatarText: { fontSize: typography.h2, fontWeight: "700", color: colors.mutedForeground },
    name: { fontSize: typography.h1, fontWeight: "600", color: colors.foreground },
    muted: { fontSize: typography.small + 1, color: colors.mutedForeground },
    error: { color: colors.destructive },
    row: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md, paddingVertical: spacing.md },
    rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
    rowValue: { fontSize: typography.small + 1, fontWeight: "600", color: colors.foreground, flexShrink: 1, textAlign: "right" },
    actions: { gap: spacing.sm },
    note: { fontSize: typography.small, color: colors.mutedForeground, textAlign: "center", marginTop: spacing.xs },
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: radius.xl + 8,
      borderTopRightRadius: radius.xl + 8,
      padding: spacing.lg,
      // Never behind the phone's own navigation bar: the sheet pads itself well clear of it.
      paddingBottom: spacing.xl * 2,
      gap: spacing.sm,
    },
    grab: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.sm },
    sheetTitle: { fontSize: typography.h2, fontWeight: "700", color: colors.foreground },
    fixed: { gap: 2 },
    sheetButtons: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  }),
);
