import { useLocalSearchParams } from "expo-router";
import { HomeLayoutAdminScreen } from "@/components/home/HomeLayoutAdminScreen";

/** An organisation admin arranging an operations or site manager's phone home screen. The server checks who may. */
export default function HomeLayoutAdminRoute() {
  const { userId, name } = useLocalSearchParams<{ userId: string; name?: string }>();
  return <HomeLayoutAdminScreen userId={String(userId)} name={String(name ?? "this person")} />;
}
