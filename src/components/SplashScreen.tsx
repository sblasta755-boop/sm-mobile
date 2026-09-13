import { useEffect, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "@/theme";

/**
 * Animated in-app splash screen shown while the session is being restored.
 * Pairs with the static native splash (app.json `splash`) which is hidden
 * as soon as this mounts, so the animation carries the app the rest of the
 * way to the login/home redirect.
 */
export function SplashScreen() {
  const logoScale = useRef(new Animated.Value(0.6)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const ringScale = useRef(new Animated.Value(0.8)).current;
  const ringOpacity = useRef(new Animated.Value(0.6)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textTranslateY = useRef(new Animated.Value(8)).current;
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1,
          friction: 5,
          tension: 60,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 420,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 360,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(textTranslateY, {
          toValue: 0,
          duration: 360,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(ringScale, {
            toValue: 1.35,
            duration: 1400,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(ringOpacity, {
            toValue: 0,
            duration: 1400,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(ringScale, {
            toValue: 0.8,
            duration: 0,
            useNativeDriver: true,
          }),
          Animated.timing(ringOpacity, {
            toValue: 0.6,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    pulse.start();

    const spinner = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1100,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    spinner.start();

    return () => {
      pulse.stop();
      spinner.stop();
    };
  }, [logoOpacity, logoScale, ringOpacity, ringScale, spin, textOpacity, textTranslateY]);

  const spinDeg = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <View style={styles.screen}>
      <View style={styles.badgeWrap}>
        <Animated.View
          style={[
            styles.ring,
            {
              opacity: ringOpacity,
              transform: [{ scale: ringScale }],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.logo,
            {
              opacity: logoOpacity,
              transform: [{ scale: logoScale }],
            },
          ]}
        >
          <Image
            source={require("../../assets/logo-mark.png")}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </Animated.View>
      </View>

      <Animated.View
        style={{
          opacity: textOpacity,
          transform: [{ translateY: textTranslateY }],
        }}
      >
        <Text style={styles.brand}>Šoma360</Text>
        <Text style={styles.tagline}>Getting things spotless…</Text>
      </Animated.View>

      <Animated.View style={[styles.spinner, { transform: [{ rotate: spinDeg }] }]} />
    </View>
  );
}

const BADGE_SIZE = 96;
const RING_SIZE = 128;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    gap: spacing.lg,
  },
  badgeWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  logo: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: radius.round,
    // Light ground, not colors.primary: the logo's building mark is
    // itself brand blue, so it would vanish into a solid blue badge.
    // The shadow stays keyed to primary, which is what gives the badge
    // its lift against the splash background.
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  logoImage: {
    // Inset within the circular badge so the mark doesn't touch the edge.
    width: BADGE_SIZE * 0.66,
    height: BADGE_SIZE * 0.66,
  },
  brand: {
    fontSize: typography.title,
    fontWeight: "700",
    color: colors.foreground,
    textAlign: "center",
    letterSpacing: 0.2,
  },
  tagline: {
    marginTop: spacing.xs,
    fontSize: typography.body,
    color: colors.mutedForeground,
    textAlign: "center",
  },
  spinner: {
    position: "absolute",
    bottom: spacing.xxl * 1.5,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2.5,
    borderColor: colors.border,
    borderTopColor: colors.primary,
  },
});
