import { useMemo } from "react";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { AddMemberFlow, type AddMemberContext } from "@/components/AddMemberFlow";
import { useSmartClean } from "@/features/store";

/**
 * A manager adds someone to their own organisation and shows them a QR code to scan. The flow itself
 * (components/AddMemberFlow) is shared with a platform operator adding someone inside an organisation.
 *
 * A manager assigned to particular sites only offers those; an org_admin (no site list of their own) offers all.
 */
export default function ManageAddStaff() {
  const { state, currentUser } = useSmartClean();

  const ctx: AddMemberContext = useMemo(() => {
    const ownSites = currentUser?.siteIds ?? [];
    return {
      getToken: async () => {
        if (!state.accessToken) throw new Error("You are signed out. Sign in again.");
        return state.accessToken;
      },
      staffRoles: state.staffRoles,
      tableServiceEnabled: !!state.tenant?.tableServiceEnabled,
      canAssignManagement: currentUser?.role === "org_admin",
      sites: ownSites.length > 0 ? state.sites.filter((s) => ownSites.includes(s.id)) : state.sites,
      recentScope: currentUser?.id ?? "anon",
    };
  }, [state.accessToken, state.staffRoles, state.tenant, state.sites, currentUser]);

  return (
    <Screen title="Add a team member">
      <AddMemberFlow ctx={ctx} onOpenApprovals={() => router.push("/manage-approvals")} />
    </Screen>
  );
}
