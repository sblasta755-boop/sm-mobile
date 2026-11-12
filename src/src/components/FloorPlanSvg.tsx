import { useRef, useState } from "react";
import { PanResponder, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle, G, Image as SvgImage, Polygon, Rect, Text as SvgText } from "react-native-svg";
import { fileUrl, type LocationLiveStatus, type LocationLiveStatusValue } from "@/api/client";
import {
  VIEWBOX_UNITS,
  boxFor,
  centroidOf,
  fitLabel,
  outlineOf,
  planHeight,
  pointsAttr,
  roomColour,
  viewBoxFor,
  zoomAbout,
} from "@/domain/siteFloor";
import type { Location, SiteFloorPlanImage } from "@/types/smartclean";
import { colors, radius, spacing, themedStyles, useThemeVersion } from "@/theme";

export interface PlanRoom {
  location: Location;
  status?: LocationLiveStatus;
}

/**
 * One floor, drawn flat: the plan photo (when there is one) with each room over it in its status colour. Tap a room to
 * select it; the + and - buttons zoom, and a zoomed plan can be dragged. The web app's version is FloorPlanCanvas.tsx.
 */
export function FloorPlanSvg({
  planImage,
  rooms,
  focusStatus,
  colourMode,
  selectedId,
  onSelect,
}: {
  planImage?: SiteFloorPlanImage;
  rooms: PlanRoom[];
  /** Rooms in any other status fade back, so one kind of trouble stands out. */
  focusStatus?: LocationLiveStatusValue | null;
  colourMode: "status" | "age";
  selectedId?: string | null;
  onSelect: (locationId: string) => void;
}) {
  useThemeVersion();
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const height = planHeight(planImage);
  const view = viewBoxFor(zoom, pan, height);
  const viewRef = useRef(view);
  viewRef.current = view;
  const widthRef = useRef(width);
  widthRef.current = width;
  const start = useRef({ x: 0, y: 0 });

  // Dragging only starts once zoomed in, so a tap on a room is still a tap and the page still scrolls at 1x.
  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => viewRef.current.w < VIEWBOX_UNITS && (Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        start.current = { x: viewRef.current.x, y: viewRef.current.y };
      },
      onPanResponderMove: (_e, g) => {
        const w = widthRef.current || 1;
        const v = viewRef.current;
        setPan({
          x: start.current.x - (g.dx / w) * v.w,
          y: start.current.y - (g.dy / (w * (v.h / v.w))) * v.h,
        });
      },
    }),
  ).current;

  const now = Date.now();
  const fontSize = 26 / Math.sqrt(zoom);
  const zoomBy = (factor: number) => {
    const next = zoomAbout(zoom, pan, factor, height);
    setZoom(next.zoom);
    setPan(next.pan);
  };
  const imageUri = fileUrl(planImage?.filePath);

  return (
    <View style={styles.wrap}>
      <View
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        style={{ width: "100%", aspectRatio: VIEWBOX_UNITS / height }}
        {...responder.panHandlers}
      >
        {width > 0 && (
          <Svg
            width="100%"
            height="100%"
            viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
            accessibilityLabel="Floor plan"
          >
            <Rect x={0} y={0} width={VIEWBOX_UNITS} height={height} fill={colors.muted} />
            {imageUri ? (
              <SvgImage href={{ uri: imageUri }} x={0} y={0} width={VIEWBOX_UNITS} height={height} preserveAspectRatio="none" />
            ) : null}
            {rooms.map(({ location, status }, index) => {
              const box = boxFor(location, index);
              const outline = outlineOf(box);
              const value: LocationLiveStatusValue = status?.status ?? "no_data";
              const colour = roomColour(value, colourMode, status?.lastCleanedAt, now);
              const dim = focusStatus != null && focusStatus !== value;
              const selected = selectedId === location.id;
              const middle = centroidOf(outline);
              const label = fitLabel(location.name, box.w * VIEWBOX_UNITS, fontSize);
              const common = {
                fill: colour,
                fillOpacity: dim ? 0.12 : 0.7,
                stroke: selected ? colors.foreground : colour,
                strokeOpacity: dim ? 0.3 : 1,
                strokeWidth: selected ? 5 / Math.sqrt(zoom) : 2.5 / Math.sqrt(zoom),
                onPress: () => onSelect(location.id),
              };
              return (
                <G key={location.id} accessibilityLabel={`${location.name}, ${value.replace(/_/g, " ")}`}>
                  {box.points && box.points.length >= 3 ? (
                    <Polygon points={pointsAttr(outline, height)} {...common} />
                  ) : (
                    <Rect
                      x={box.x * VIEWBOX_UNITS}
                      y={box.y * height}
                      width={box.w * VIEWBOX_UNITS}
                      height={box.h * height}
                      rx={6}
                      {...common}
                    />
                  )}
                  {label ? (
                    <SvgText
                      x={middle.x * VIEWBOX_UNITS}
                      y={middle.y * height + fontSize / 3}
                      fontSize={fontSize}
                      fontWeight="700"
                      fill="#ffffff"
                      fillOpacity={dim ? 0.4 : 1}
                      textAnchor="middle"
                      pointerEvents="none"
                    >
                      {label}
                    </SvgText>
                  ) : null}
                  {value === "incident_open" && !dim ? (
                    <Circle
                      cx={(box.x + box.w) * VIEWBOX_UNITS - 12 / Math.sqrt(zoom)}
                      cy={box.y * height + 12 / Math.sqrt(zoom)}
                      r={9 / Math.sqrt(zoom)}
                      fill="#ffffff"
                      stroke={STATUS_ALERT}
                      strokeWidth={4 / Math.sqrt(zoom)}
                      pointerEvents="none"
                    />
                  ) : null}
                </G>
              );
            })}
          </Svg>
        )}
      </View>
      <View style={styles.zoom}>
        <ZoomButton icon="add" label="Zoom in" disabled={zoom >= 4} onPress={() => zoomBy(1.6)} />
        <ZoomButton icon="remove" label="Zoom out" disabled={zoom <= 1} onPress={() => zoomBy(1 / 1.6)} />
        {zoom > 1 && (
          <ZoomButton
            icon="refresh"
            label="Reset view"
            onPress={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
          />
        )}
      </View>
      {rooms.length === 0 && (
        <View style={styles.empty} pointerEvents="none">
          <Text style={styles.emptyText}>No rooms on this floor yet.</Text>
        </View>
      )}
    </View>
  );
}

const STATUS_ALERT = "#ef4444";

function ZoomButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={[styles.zoomBtn, disabled && { opacity: 0.35 }]}
    >
      <Ionicons name={icon} size={18} color={colors.foreground} />
    </Pressable>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    wrap: { borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, overflow: "hidden", backgroundColor: colors.card },
    zoom: { position: "absolute", right: spacing.sm, top: spacing.sm, gap: spacing.xs },
    zoomBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    empty: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
    emptyText: { color: colors.mutedForeground },
  }),
);
