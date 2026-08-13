import { StyleSheet, View } from "react-native";
import { colors, radius } from "@/theme";

export function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${pct}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 8,
    borderRadius: radius.round,
    backgroundColor: colors.muted,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: radius.round,
    backgroundColor: colors.primary,
  },
});
