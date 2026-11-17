import { useLocalSearchParams } from "expo-router";
import { HomeLayoutAdminScreen } from "@/components/home/HomeLayoutAdminScreen";

/** The platform operator arranging anyone's phone home screen in a customer organisation. */
export default function PlatformHomeLayoutRoute() {
  const { tenantId, userId, name } = useLocalSearchParams<{ tenantId: string; userId: string; name?: string }>();
  return <HomeLayoutAdminScreen userId={String(userId)} name={String(name ?? "this person")} tenantId={String(tenantId)} />;
}
