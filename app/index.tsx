import { Redirect } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useSmartClean } from "@/features/store";
import { colors, spacing, typography } from "@/theme";

export default function Index() {
  const { state, currentUser } = useSmartClean();

  if (!state.sessionRestored) {
    return (
      <View style={styles.screen}>
        <Text style={styles.body}>Loading…</Text>
      </View>
    );
  }

  return <Redirect href={currentUser ? "/home" : "/login"} />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  body: {
    fontSize: typography.body,
    color: colors.mutedForeground,
  },
});
