import { useEffect, useState } from "react";
import { BackHandler, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePathname, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoleTabs } from "@/components/RoleTabBar";
import { useSmartClean } from "@/features/store";
import {
  closeTour,
  goToStep,
  leaveTour,
  markTourSeen,
  measureTarget,
  useAutoStartTour,
  useTourState,
  useTourSteps,
  type Rect,
} from "@/features/tour";
import { colors, radius, sizes, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

/** The spotlight: dim the screen, cut a hole round the target, explain it in a bubble. Mounted once in the root layout. */

const PAD = 6; // breathing room round the control
const GAP = 12; // between the hole and the bubble
const ARROW = 12;
const NAVIGATE_WAIT_MS = 250;
const SETTLED_WAIT_MS = 60;
const POLL_MS = 100;
const GIVE_UP_MS = 1800;

export function TourOverlay() {
  useThemeVersion();
  useAutoStartTour();
  const tour = useTourState();
  if (!tour.active) return null;
  return <ActiveTour />;
}

function ActiveTour() {
  const tour = useTourState();
  // Frozen when the tour starts: the screens it visits mount and unmount, and the numbering must not move under the person.
  const liveSteps = useTourSteps();
  const [steps] = useState(liveSteps);
  const tabCount = useRoleTabs().length;
  const { currentUser } = useSmartClean();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { width, height } = useWindowDimensions();
  const [rect, setRect] = useState<Rect | null>(null);
  const [ready, setReady] = useState(false);
  const [bubbleHeight, setBubbleHeight] = useState(150);
  const step = steps[tour.index];
  const last = tour.index >= steps.length - 1;
  const role = currentUser?.role;

  const next = () => {
    if (last) {
      // Finishing, not closing early, is what marks the tour as seen.
      void markTourSeen();
      closeTour();
      leaveTour(role);
    } else {
      goToStep(tour.index + 1);
    }
  };
  // Skipping also counts as seen, so it does not come back next launch.
  const skip = () => {
    void markTourSeen();
    closeTour();
    leaveTour(role);
  };
  const close = () => {
    closeTour();
    leaveTour(role);
  };

  // Android back: nothing on the first run, closes on a replay.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (tour.replay) close();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour.replay]);

  // Nothing to walk (signed out underneath us): get out of the way.
  useEffect(() => {
    if (!currentUser || steps.length === 0) closeTour();
  }, [currentUser, steps.length]);

  // Per step: go to the screen, let it settle, then look for a target until one is on screen.
  useEffect(() => {
    if (!step) return;
    let cancelled = false;
    setReady(false);
    setRect(null);
    const needsNavigation = !!step.to && pathname !== step.to;
    if (needsNavigation) router.navigate(step.to as never);

    const tabBarTop = height - (sizes.bottomNavHeight + insets.bottom);
    const locate = async (id: string): Promise<Rect | null> => {
      if (id === "tabbar") return { x: 0, y: tabBarTop, width, height: sizes.bottomNavHeight + insets.bottom };
      if (id.startsWith("tab:")) {
        // The bar's tabs share its width equally, so a tab's place is known without measuring it.
        const index = Number(id.slice(4));
        const count = tabCount;
        if (!count || Number.isNaN(index)) return null;
        return { x: (index * width) / count, y: tabBarTop, width: width / count, height: sizes.bottomNavHeight + insets.bottom };
      }
      return measureTarget(id, { width, height });
    };

    const start = Date.now();
    const poll = async () => {
      if (cancelled) return;
      for (const id of step.target ?? []) {
        const found = await locate(id);
        if (cancelled) return;
        if (found) {
          setRect(found);
          setReady(true);
          return;
        }
      }
      if (!step.target?.length || Date.now() - start >= GIVE_UP_MS) {
        // It cannot get stuck: no target in time means a centred bubble with no spotlight.
        setReady(true);
        return;
      }
      setTimeout(poll, POLL_MS);
    };
    const t = setTimeout(poll, needsNavigation ? NAVIGATE_WAIT_MS : SETTLED_WAIT_MS);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // pathname is read once per step on purpose: navigating must not restart the step it was caused by.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.id, width, height, tabCount]);

  if (!step) return null;

  const hole = rect
    ? {
        x: Math.max(0, rect.x - PAD),
        y: Math.max(0, rect.y - PAD),
        width: Math.min(width, rect.width + PAD * 2),
        height: rect.height + PAD * 2,
      }
    : null;

  // The bubble sits below the hole when there is room, otherwise above.
  const margin = spacing.lg;
  const bubbleWidth = Math.min(width - margin * 2, 360);
  const roomBelow = hole ? height - insets.bottom - (hole.y + hole.height) - GAP - ARROW : 0;
  const below = hole ? roomBelow >= bubbleHeight : true;
  let bubbleLeft = (width - bubbleWidth) / 2;
  let bubbleTop = (height - bubbleHeight) / 2;
  let arrowLeft = 0;
  if (hole) {
    bubbleTop = below ? hole.y + hole.height + GAP + ARROW : hole.y - GAP - ARROW - bubbleHeight;
    bubbleTop = Math.max(insets.top + spacing.sm, bubbleTop);
    const center = hole.x + hole.width / 2;
    bubbleLeft = Math.min(Math.max(margin, center - bubbleWidth / 2), width - margin - bubbleWidth);
    arrowLeft = Math.min(Math.max(center - bubbleLeft - ARROW, spacing.md), bubbleWidth - ARROW * 2 - spacing.md);
  }

  return (
    <View style={styles.root} pointerEvents="box-none" accessibilityViewIsModal>
      {/* Four dim panels round the hole. Together they cover the screen and swallow touches. */}
      {hole ? (
        <>
          <Pressable style={[styles.dim, { top: 0, left: 0, right: 0, height: hole.y }]} />
          <Pressable style={[styles.dim, { top: hole.y + hole.height, left: 0, right: 0, bottom: 0 }]} />
          <Pressable style={[styles.dim, { top: hole.y, left: 0, width: hole.x, height: hole.height }]} />
          <Pressable
            style={[styles.dim, { top: hole.y, left: hole.x + hole.width, right: 0, height: hole.height }]}
          />
          {/* Tapping the highlighted control moves on, the same as Next. */}
          <Pressable
            onPress={next}
            accessibilityLabel="Next step"
            style={[styles.hole, { top: hole.y, left: hole.x, width: hole.width, height: hole.height }]}
          />
        </>
      ) : (
        <Pressable style={[styles.dim, StyleSheet.absoluteFillObject]} />
      )}

      {ready && (
        <View
          onLayout={(e) => setBubbleHeight(e.nativeEvent.layout.height)}
          style={[styles.bubble, { width: bubbleWidth, left: bubbleLeft, top: bubbleTop }]}
          accessibilityLiveRegion="polite"
        >
          {hole && (
            <View
              style={[
                styles.arrow,
                below ? { top: -ARROW / 2 } : { bottom: -ARROW / 2 },
                { left: arrowLeft + ARROW / 2 },
              ]}
            />
          )}
          <Text style={styles.title}>{step.title}</Text>
          <Text style={styles.body}>{step.body}</Text>
          <View style={styles.footer}>
            <Text style={styles.counter}>
              {tour.index + 1}/{steps.length}
            </Text>
            {!last && (
              <Pressable accessibilityRole="button" accessibilityLabel="Skip the tour" onPress={skip} style={styles.skip}>
                <Text style={styles.skipText}>Skip</Text>
              </Pressable>
            )}
            <Pressable accessibilityRole="button" onPress={next} style={styles.next}>
              <Text style={styles.nextText}>{last ? "OK" : "Next"}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {tour.replay && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close the tour"
          onPress={close}
          style={[
            styles.close,
            // Above the tab bar and the phone's own buttons, never behind them.
            { right: spacing.lg, bottom: sizes.bottomNavHeight + insets.bottom + spacing.lg },
          ]}
        >
          <Ionicons name="close" size={22} color={colors.foreground} />
        </Pressable>
      )}
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    root: { ...StyleSheet.absoluteFillObject, zIndex: 9999, elevation: 9999 },
    dim: { position: "absolute", backgroundColor: "rgba(0,0,0,0.72)" },
    hole: {
      position: "absolute",
      borderRadius: radius.xl,
      borderWidth: 2,
      borderStyle: "dashed",
      borderColor: "#ffffff",
    },
    bubble: {
      position: "absolute",
      backgroundColor: colors.card,
      borderRadius: radius.xl,
      padding: spacing.lg,
      gap: spacing.sm,
      shadowColor: "#000",
      shadowOpacity: 0.3,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 12,
    },
    arrow: {
      position: "absolute",
      width: ARROW,
      height: ARROW,
      backgroundColor: colors.card,
      transform: [{ rotate: "45deg" }],
    },
    title: { fontSize: typography.h2, fontWeight: "800", color: colors.foreground },
    body: { fontSize: typography.body, color: colors.mutedForeground, lineHeight: 21 },
    footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xs },
    counter: { fontSize: typography.small, fontWeight: "700", color: colors.mutedForeground },
    next: {
      minHeight: sizes.touchTarget,
      paddingHorizontal: spacing.xl,
      borderRadius: radius.round,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    skip: { minHeight: sizes.touchTarget, paddingHorizontal: spacing.md, alignItems: "center", justifyContent: "center", marginLeft: "auto", marginRight: spacing.sm },
    skipText: { fontWeight: "700", color: colors.mutedForeground },
    nextText: { fontWeight: "700", color: colors.primaryForeground },
    close: {
      position: "absolute",
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.card,
      alignItems: "center",
      justifyContent: "center",
      elevation: 12,
      shadowColor: "#000",
      shadowOpacity: 0.3,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
    },
  }),
);
