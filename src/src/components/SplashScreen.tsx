import { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Image, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography, themedStyles } from "@/theme";

/**
 * Animated in-app splash screen shown while the session is being restored.
 * Pairs with the static native splash (app.json `splash`) which is hidden
 * as soon as this mounts, so the animation carries the app the rest of the
 * way to the login/home redirect.
 *
 * Every animation here runs on the native driver (transform/opacity only),
 * so a busy JS thread restoring the session can't make it stutter — which
 * is the whole point, since this screen only exists while that work runs.
 */

const BADGE_SIZE = 96;
const RING_SIZE = 128;
const ORBIT_SIZE = 172;
/** Three sparks, evenly spaced around the orbit. */
const SPARKS = [0, 1, 2];

export function SplashScreen() {
  const logoScale = useRef(new Animated.Value(0.6)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const ringScale = useRef(new Animated.Value(0.8)).current;
  const ringOpacity = useRef(new Animated.Value(0.6)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textTranslateY = useRef(new Animated.Value(8)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const orbit = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const sheen = useRef(new Animated.Value(0)).current;

  // Respect the OS "reduce motion" setting: the looping orbit, pulse and
  // shimmer are decorative, so we settle straight to the resting frame
  // rather than running them.
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (!cancelled) setReduceMotion(enabled);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    // The entrance runs either way — it's what makes the handoff from the
    // native splash feel continuous — just instantly when motion is reduced.
    const entrance = Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1,
          friction: 5,
          tension: 60,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: reduceMotion ? 0 : 420,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: reduceMotion ? 0 : 360,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(textTranslateY, {
          toValue: 0,
          duration: reduceMotion ? 0 : 360,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]);

    if (reduceMotion) {
      logoScale.setValue(1);
      logoOpacity.setValue(1);
      textOpacity.setValue(1);
      textTranslateY.setValue(0);
      ringOpacity.setValue(0);
      return;
    }

    entrance.start();

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

    // Sparks circling the badge. One linear loop drives all three; they're
    // offset by rotating each spark's container a third of a turn.
    const orbiter = Animated.loop(
      Animated.timing(orbit, {
        toValue: 1,
        duration: 4200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    orbiter.start();

    // Slow scale drift on the badge, so the centre never sits perfectly still.
    const breathing = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    breathing.start();

    // A light sweep across the wordmark, paused between passes.
    const shimmer = Animated.loop(
      Animated.sequence([
        Animated.delay(900),
        Animated.timing(sheen, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(sheen, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    shimmer.start();

    return () => {
      entrance.stop();
      pulse.stop();
      spinner.stop();
      orbiter.stop();
      breathing.stop();
      shimmer.stop();
    };
  }, [
    breathe,
    logoOpacity,
    logoScale,
    orbit,
    reduceMotion,
    ringOpacity,
    ringScale,
    sheen,
    spin,
    textOpacity,
    textTranslateY,
  ]);

  const spinDeg = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const orbitDeg = orbit.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  // Counter-rotation keeps each spark upright as its arm sweeps around.
  const counterDeg = orbit.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "-360deg"],
  });

  const badgeBreath = breathe.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.04],
  });

  const sheenTranslate = sheen.interpolate({
    inputRange: [0, 1],
    outputRange: [-140, 140],
  });

  // Fade the sweep in and out at the edges so it never pops at the bounds.
  const sheenOpacity = sheen.interpolate({
    inputRange: [0, 0.15, 0.85, 1],
    outputRange: [0, 0.5, 0.5, 0],
  });

  const sparks = useMemo(
    () =>
      SPARKS.map((index) => ({
        index,
        // Static offset per spark, applied before the shared spin.
        baseDeg: `${(360 / SPARKS.length) * index}deg`,
      })),
    [],
  );

  return (
    <View style={styles.screen}>
      <View style={styles.orbitWrap}>
        {!reduceMotion &&
          sparks.map(({ index, baseDeg }) => (
            <Animated.View
              key={index}
              pointerEvents="none"
              style={[
                styles.orbitArm,
                { transform: [{ rotate: baseDeg }, { rotate: orbitDeg }] },
              ]}
            >
              <Animated.View
                style={[
                  styles.spark,
                  index === 1 && styles.sparkAlt,
                  index === 2 && styles.sparkSmall,
                  { transform: [{ rotate: counterDeg }] },
                ]}
              />
            </Animated.View>
          ))}

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
                transform: [{ scale: logoScale }, { scale: badgeBreath }],
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
      </View>

      <Animated.View
        style={{
          opacity: textOpacity,
          transform: [{ translateY: textTranslateY }],
        }}
      >
        <View style={styles.brandWrap}>
          <Text style={styles.brand}>Šoma360</Text>
          {!reduceMotion && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.sheen,
                {
                  opacity: sheenOpacity,
                  transform: [{ translateX: sheenTranslate }, { rotate: "18deg" }],
                },
              ]}
            />
          )}
        </View>
        <Text style={styles.tagline}>Getting things spotless…</Text>
      </Animated.View>

      {!reduceMotion && (
        <Animated.View style={[styles.spinner, { transform: [{ rotate: spinDeg }] }]} />
      )}
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    gap: spacing.lg,
  },
  orbitWrap: {
    width: ORBIT_SIZE,
    height: ORBIT_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  // Full-size square pinned to the centre; rotating it swings the spark
  // pinned at its top edge around a circle of radius ORBIT_SIZE / 2.
  orbitArm: {
    position: "absolute",
    width: ORBIT_SIZE,
    height: ORBIT_SIZE,
    alignItems: "center",
  },
  spark: {
    width: 10,
    height: 10,
    borderRadius: radius.round,
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.45,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  sparkAlt: {
    backgroundColor: colors.success,
    shadowColor: colors.success,
  },
  sparkSmall: {
    width: 6,
    height: 6,
    backgroundColor: colors.info,
    shadowColor: colors.info,
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
  brandWrap: {
    // Clips the sweep to the wordmark's own box.
    overflow: "hidden",
  },
  brand: {
    fontSize: typography.title,
    fontWeight: "700",
    color: colors.foreground,
    textAlign: "center",
    letterSpacing: 0.2,
  },
  sheen: {
    ...StyleSheet.absoluteFillObject,
    width: 44,
    // Taller than the text box so the tilted band covers it corner to corner.
    height: 80,
    top: -20,
    left: "50%",
    marginLeft: -22,
    backgroundColor: colors.accent,
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
}));
