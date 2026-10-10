import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { inferTone, type DialogButton, type DialogTone } from "@/domain/dialogTone";
import { colors, radius, spacing, themedStyles, typography, useThemeVersion } from "@/theme";

/**
 * The app's own dialog, replacing the system alert. `appAlert` takes the same
 * arguments as `Alert.alert`, so a call site only changes its import; the look
 * (tinted icon, themed card, light and dark) comes from <DialogHost />, mounted
 * once in the root layout.
 */
export type { DialogButton, DialogTone };
type DialogRequest = { title: string; message?: string; buttons: DialogButton[]; tone: DialogTone };

const queue: DialogRequest[] = [];
let show: ((next: DialogRequest | null) => void) | null = null;

export function appAlert(title: string, message?: string, buttons?: DialogButton[], tone?: DialogTone) {
  const list = buttons && buttons.length ? buttons : [{ text: "OK" }];
  const request: DialogRequest = { title, message, buttons: list, tone: tone ?? inferTone(title, list) };
  if (show) {
    show(request);
  } else {
    queue.push(request);
  }
}

const ICON: Record<DialogTone, keyof typeof Ionicons.glyphMap> = {
  info: "information-circle",
  success: "checkmark-circle",
  warning: "alert-circle",
  danger: "close-circle",
};

export function toneColors(tone: DialogTone) {
  switch (tone) {
    case "success":
      return { fg: colors.success, bg: colors.successSoft };
    case "warning":
      return { fg: colors.warning, bg: colors.warningSoft };
    case "danger":
      return { fg: colors.destructive, bg: colors.destructiveSoft };
    default:
      return { fg: colors.info, bg: colors.infoSoft };
  }
}

export function DialogHost() {
  useThemeVersion();
  const [current, setCurrent] = useState<DialogRequest | null>(null);
  const pending = useRef<DialogRequest[]>([]);
  const progress = useRef(new Animated.Value(0)).current;

  const open = useRef(false);

  const present = useCallback(
    (next: DialogRequest | null) => {
      if (!next) return;
      // One dialog at a time; the rest wait their turn.
      if (open.current) {
        pending.current.push(next);
        return;
      }
      open.current = true;
      progress.setValue(0);
      Animated.timing(progress, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      setCurrent(next);
    },
    [progress],
  );

  useEffect(() => {
    show = present;
    queue.splice(0).forEach(present);
    return () => {
      show = null;
    };
  }, [present]);

  const close = (button?: DialogButton) => {
    open.current = false;
    setCurrent(null);
    const after = pending.current.shift();
    if (after) setTimeout(() => present(after), 120);
    void button?.onPress?.();
  };

  if (!current) return null;
  const tone = toneColors(current.tone);
  const cancel = current.buttons.find((b) => b.style === "cancel");
  const stacked = current.buttons.length > 2;

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={() => close(cancel)}>
      <Pressable style={styles.backdrop} onPress={() => close(cancel)} accessibilityLabel="Dismiss" />
      <View style={styles.center} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.card,
            {
              opacity: progress,
              transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
            },
          ]}
        >
          <View style={[styles.glow, { backgroundColor: tone.fg }]} />
          <View style={[styles.iconWrap, { backgroundColor: tone.bg }]}>
            <Ionicons name={ICON[current.tone]} size={30} color={tone.fg} />
          </View>
          <Text style={styles.title}>{current.title}</Text>
          {current.message ? <Text style={styles.message}>{current.message}</Text> : null}
          <View style={[styles.buttons, stacked && styles.buttonsStacked]}>
            {current.buttons.map((button, index) => {
              const destructive = button.style === "destructive";
              const secondary = button.style === "cancel";
              const filledColor = destructive ? colors.destructive : colors.primary;
              return (
                <Pressable
                  key={`${button.text}-${index}`}
                  accessibilityRole="button"
                  onPress={() => close(button)}
                  style={({ pressed }) => [
                    styles.button,
                    secondary ? styles.buttonSecondary : { backgroundColor: filledColor },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      { color: secondary ? colors.foreground : destructive ? colors.white : colors.primaryForeground },
                    ]}
                  >
                    {button.text}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
    center: { flex: 1, justifyContent: "center", paddingHorizontal: spacing.lg },
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      alignItems: "center",
      overflow: "hidden",
      elevation: 12,
      shadowColor: "#000",
      shadowOpacity: 0.25,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 10 },
    },
    // A soft wash of the tone colour along the top edge.
    glow: { position: "absolute", top: -60, width: 160, height: 120, borderRadius: 80, opacity: 0.12 },
    iconWrap: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: spacing.md,
    },
    title: { fontSize: typography.h1, fontWeight: "700", color: colors.foreground, textAlign: "center" },
    message: {
      fontSize: typography.body,
      color: colors.mutedForeground,
      textAlign: "center",
      marginTop: spacing.sm,
      lineHeight: 20,
    },
    buttons: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg, alignSelf: "stretch" },
    buttonsStacked: { flexDirection: "column-reverse" },
    button: { flex: 1, minHeight: 46, borderRadius: radius.md, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.md },
    buttonSecondary: { backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.border },
    buttonText: { fontSize: typography.body, fontWeight: "600" },
  }),
);
