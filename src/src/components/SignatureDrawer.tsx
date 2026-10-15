import { useMemo, useRef, useState } from "react";
import { Modal, PanResponder, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "@/components/Button";
import { strokesToPath, type Stroke } from "@/domain/signoff";
import { colors, radius, spacing, themedStyles, typography, useThemeVersion } from "@/theme";

export interface SignatureResult {
  strokes: Stroke[];
  width: number;
  height: number;
}

/**
 * A bottom drawer to sign with a finger. Strokes are kept as points in the
 * drawing area's own pixels (the server stores them as a vector path), and
 * nothing is kept until the person taps Done.
 */
export function SignatureDrawer({
  visible,
  initial,
  onClose,
  onDone,
}: {
  visible: boolean;
  initial?: SignatureResult | null;
  onClose: () => void;
  onDone: (result: SignatureResult) => void;
}) {
  useThemeVersion();
  const [strokes, setStrokes] = useState<Stroke[]>(initial?.strokes ?? []);
  const [size, setSize] = useState({ width: 300, height: 220 });
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          const { locationX, locationY } = event.nativeEvent;
          setStrokes((list) => [...list, { points: [[locationX, locationY]] }]);
        },
        onPanResponderMove: (event) => {
          const { locationX, locationY } = event.nativeEvent;
          setStrokes((list) => {
            if (list.length === 0) return list;
            const last = list[list.length - 1];
            return [...list.slice(0, -1), { points: [...last.points, [locationX, locationY]] }];
          });
        },
        // Keep drawing even if the finger briefly leaves the area's edge.
        onPanResponderTerminationRequest: () => false,
      }),
    [],
  );

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  };

  const hasInk = strokes.some((s) => s.points.length > 1);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={24} color={colors.foreground} />
          </Pressable>
          <Text style={styles.title}>Sign here</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Clear" onPress={() => setStrokes([])} hitSlop={8}>
            <Text style={styles.clear}>Clear</Text>
          </Pressable>
        </View>
        <View style={styles.pad} onLayout={onLayout} {...responder.panHandlers}>
          <Svg width="100%" height="100%" pointerEvents="none">
            <Path d={strokesToPath(strokes)} stroke={colors.foreground} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
          <View style={styles.baseline} pointerEvents="none" />
          {!hasInk && (
            <Text style={styles.hint} pointerEvents="none">
              Sign your name using your finger
            </Text>
          )}
        </View>
        <Button
          disabled={!hasInk}
          onPress={() => onDone({ strokes: strokesRef.current, width: sizeRef.current.width, height: sizeRef.current.height })}
        >
          Done
        </Button>
      </View>
    </Modal>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: colors.overlay },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      padding: spacing.lg,
      gap: spacing.md,
    },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    title: { fontSize: typography.h2, fontWeight: "700", color: colors.foreground },
    clear: { fontSize: typography.body, fontWeight: "600", color: colors.primary },
    pad: {
      height: 240,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      overflow: "hidden",
    },
    baseline: { position: "absolute", left: spacing.lg, right: spacing.lg, bottom: 48, height: 1, backgroundColor: colors.border },
    hint: { position: "absolute", left: 0, right: 0, bottom: 20, textAlign: "center", color: colors.mutedForeground, fontSize: typography.small },
  }),
);
