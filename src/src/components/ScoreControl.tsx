import { useEffect, useRef, useState } from "react";
import { PanResponder, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, typography, themedStyles } from "@/theme";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * A 0-100 score that can be set three ways, whichever is quickest at the
 * time: drag the bar with a finger, type the number, or nudge it by one with
 * the minus and plus buttons.
 */
export function ScoreControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  // What is in the box while typing (may be empty or partial); the real
  // value is committed on every valid keystroke and tidied on blur.
  const [text, setText] = useState(String(value));
  const [typing, setTyping] = useState(false);
  const width = useRef(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Keep the box in step when the value moves by drag or buttons.
  useEffect(() => {
    if (!typing) setText(String(value));
  }, [value, typing]);

  const fromX = (x: number) => {
    if (width.current <= 0) return;
    onChangeRef.current(clamp((x / width.current) * 100));
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // A horizontal drag on the bar must not be stolen by the scroll view.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event) => fromX(event.nativeEvent.locationX),
      onPanResponderMove: (event) => fromX(event.nativeEvent.locationX),
    }),
  ).current;

  const commitText = (raw: string) => {
    setText(raw);
    const digits = raw.replace(/[^0-9]/g, "");
    if (digits === "") return;
    onChange(clamp(Number(digits)));
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.controls}>
          <Pressable
            accessibilityLabel={`Lower ${label}`}
            onPress={() => onChange(clamp(value - 1))}
            hitSlop={6}
            style={styles.step}
          >
            <Ionicons name="remove" size={16} color={colors.foreground} />
          </Pressable>
          <TextInput
            accessibilityLabel={`${label} score`}
            value={text}
            onFocus={() => setTyping(true)}
            onChangeText={commitText}
            onBlur={() => {
              setTyping(false);
              setText(String(value));
            }}
            keyboardType="number-pad"
            maxLength={3}
            selectTextOnFocus
            style={styles.input}
          />
          <Pressable
            accessibilityLabel={`Raise ${label}`}
            onPress={() => onChange(clamp(value + 1))}
            hitSlop={6}
            style={styles.step}
          >
            <Ionicons name="add" size={16} color={colors.foreground} />
          </Pressable>
        </View>
      </View>

      {/* The touch area is taller than the 8px bar so a finger can find it. */}
      <View
        accessibilityRole="adjustable"
        accessibilityLabel={`${label} slider`}
        accessibilityValue={{ min: 0, max: 100, now: value }}
        onLayout={(event) => {
          width.current = event.nativeEvent.layout.width;
        }}
        style={styles.touch}
        {...pan.panHandlers}
      >
        <View style={styles.track} pointerEvents="none">
          <View style={[styles.fill, { width: `${value}%` }]} />
        </View>
        <View pointerEvents="none" style={[styles.thumb, { left: `${value}%` }]} />
      </View>
    </View>
  );
}

const THUMB = 22;

const styles = themedStyles(() => StyleSheet.create({
  wrap: { gap: 4 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { flex: 1, fontSize: typography.small, color: colors.foreground },
  controls: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  step: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    width: 52,
    height: 32,
    paddingVertical: 0,
    textAlign: "center",
    fontSize: typography.body,
    fontWeight: "700",
    color: colors.foreground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
  },
  touch: { height: 36, justifyContent: "center" },
  track: { height: 8, borderRadius: radius.round, backgroundColor: colors.muted, overflow: "hidden" },
  fill: { height: 8, backgroundColor: colors.primary },
  thumb: {
    position: "absolute",
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    marginLeft: -THUMB / 2,
    backgroundColor: colors.card,
    borderWidth: 3,
    borderColor: colors.primary,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
}));
