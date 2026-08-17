import { Redirect } from "expo-router";
import { SplashScreen } from "@/components/SplashScreen";
import { useSmartClean } from "@/features/store";

export default function Index() {
  const { state, currentUser } = useSmartClean();

  if (!state.sessionRestored) {
    return <SplashScreen />;
  }

  return <Redirect href={currentUser ? "/home" : "/login"} />;
}
