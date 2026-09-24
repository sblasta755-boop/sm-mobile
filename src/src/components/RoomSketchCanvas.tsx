import { useMemo, useRef, useState } from "react";
import { PanResponder, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Polygon, Rect } from "react-native-svg";
import { colors, radius } from "@/theme";

/**
 * A quick, rough on-screen room-shape sketch - the manual fallback when
 * neither a floor-plan photo nor (iOS-only, not built yet) a RoomPlan
 * scan applies. Deliberately simpler than the web app's
 * FloorPlanCanvas.tsx edit mode: draw once, don't fine-edit afterward -
 * if the shape is wrong, clear and redraw.
 *
 * Not a port of FloorPlanCanvas.tsx: that component's whole interaction
 * model is DOM PointerEvent (onPointerDown, window-level
 * pointermove/pointerup listeners, setPointerCapture) - none of which
 * exists in React Native. This uses PanResponder (part of core
 * react-native, no new native dependency) rather than
 * react-native-gesture-handler, since the gesture surface here (a single
 * drag, or a sequence of taps) doesn't need anything more - keeping this
 * feature buildable without a new native module or a fresh dev-client
 * build, which is real friction, in an already-native-module-heavy
 * plan (see the RoomPlan work elsewhere in this feature).
 *
 * Coordinates are captured relative to the canvas's own measured bounds
 * and reported normalized 0-1, matching every other layout source in
 * this app (see Location.layout's docstring).
 */

type Mode = "box" | "polygon";

export interface RoomSketchResult {
  x: number;
  y: number;
  w: number;
  h: number;
  points?: { x: number; y: number }[];
}

export function RoomSketchCanvas({
  mode,
  onChange,
}: {
  mode: Mode;
  /** Fires on every completed shape (box: after drag release; polygon:
   * after each vertex, and again once closed) - the caller decides when
   * a result is "done enough" to save (see sketch.tsx's Save button). */
  onChange: (result: RoomSketchResult | null) => void;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [boxDrag, setBoxDrag] = useState<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null);
  const [polygonPoints, setPolygonPoints] = useState<{ x: number; y: number }[]>([]);
  const sizeRef = useRef(size);
  sizeRef.current = size;

  function onLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  }

  function toNormalized(pageX: number, pageY: number, originX: number, originY: number) {
    const { width, height } = sizeRef.current;
    if (width === 0 || height === 0) return { x: 0, y: 0 };
    const x = Math.min(1, Math.max(0, (pageX - originX) / width));
    const y = Math.min(1, Math.max(0, (pageY - originY) / height));
    return { x, y };
  }

  const containerRef = useRef<View | null>(null);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => mode === "box",
        onMoveShouldSetPanResponder: () => mode === "box",
        onPanResponderGrant: (event) => {
          if (mode !== "box") return;
          containerRef.current?.measure((_fx, _fy, _w, _h, pageX, pageY) => {
            const start = toNormalized(event.nativeEvent.pageX, event.nativeEvent.pageY, pageX, pageY);
            setBoxDrag({ start, end: start });
          });
        },
        onPanResponderMove: (event) => {
          if (mode !== "box") return;
          containerRef.current?.measure((_fx, _fy, _w, _h, pageX, pageY) => {
            const end = toNormalized(event.nativeEvent.pageX, event.nativeEvent.pageY, pageX, pageY);
            setBoxDrag((current) => (current ? { ...current, end } : current));
          });
        },
        onPanResponderRelease: () => {
          setBoxDrag((current) => {
            if (!current) return null;
            const x = Math.min(current.start.x, current.end.x);
            const y = Math.min(current.start.y, current.end.y);
            const w = Math.max(0.03, Math.abs(current.end.x - current.start.x));
            const h = Math.max(0.03, Math.abs(current.end.y - current.start.y));
            onChange({ x, y, w, h });
            return current;
          });
        },
      }),
    [mode, onChange],
  );

  function handlePolygonTap(event: { nativeEvent: { pageX: number; pageY: number } }) {
    if (mode !== "polygon") return;
    containerRef.current?.measure((_fx, _fy, _w, _h, pageX, pageY) => {
      const point = toNormalized(event.nativeEvent.pageX, event.nativeEvent.pageY, pageX, pageY);
      setPolygonPoints((current) => {
        // Tapping near the first point (within ~5% of canvas size)
        // closes the shape, mirroring the web sketch convention of
        // "tap the start again to finish".
        if (current.length >= 3) {
          const first = current[0];
          const distance = Math.hypot(point.x - first.x, point.y - first.y);
          if (distance < 0.05) {
            const xs = current.map((p) => p.x);
            const ys = current.map((p) => p.y);
            const x = Math.min(...xs);
            const y = Math.min(...ys);
            const w = Math.max(...xs) - x;
            const h = Math.max(...ys) - y;
            onChange({ x, y, w, h, points: current });
            return current;
          }
        }
        const next = [...current, point];
        onChange(null);
        return next;
      });
    });
  }

  const boxRect =
    mode === "box" && boxDrag
      ? {
          x: Math.min(boxDrag.start.x, boxDrag.end.x) * size.width,
          y: Math.min(boxDrag.start.y, boxDrag.end.y) * size.height,
          w: Math.abs(boxDrag.end.x - boxDrag.start.x) * size.width,
          h: Math.abs(boxDrag.end.y - boxDrag.start.y) * size.height,
        }
      : null;

  const polygonSvgPoints = polygonPoints.map((p) => `${p.x * size.width},${p.y * size.height}`).join(" ");

  return (
    <View
      ref={containerRef}
      onLayout={onLayout}
      style={styles.canvas}
      onStartShouldSetResponder={() => mode === "polygon"}
      onResponderRelease={handlePolygonTap}
      {...(mode === "box" ? panResponder.panHandlers : {})}
    >
      <Svg width={size.width} height={size.height} style={StyleSheet.absoluteFill}>
        {boxRect && (
          <Rect
            x={boxRect.x}
            y={boxRect.y}
            width={boxRect.w}
            height={boxRect.h}
            fill={colors.primary + "33"}
            stroke={colors.primary}
            strokeWidth={2}
            rx={4}
          />
        )}
        {polygonPoints.length >= 2 && (
          <Polygon points={polygonSvgPoints} fill={colors.primary + "33"} stroke={colors.primary} strokeWidth={2} />
        )}
        {polygonPoints.map((p, index) => (
          <Circle key={index} cx={p.x * size.width} cy={p.y * size.height} r={5} fill={colors.primary} />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    width: "100%",
    height: 320,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
});
