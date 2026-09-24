import Svg, { Path, Rect } from "react-native-svg";
import { colors } from "@/theme";

/**
 * A literal broken-glass glyph for the "Report incident" action -
 * Ionicons (the icon set used elsewhere in this app) has no broken-glass
 * icon, so this is a small hand-drawn SVG matching the app's other icons'
 * visual weight (24x24, currentColor-equivalent stroke, 2px round
 * linecap/join, no fill). Mirrors the web app's
 * components/smartclean/BrokenGlassIcon.tsx - keep both in sync if the
 * artwork ever changes.
 */
export function BrokenGlassIcon({ size = 16, color = colors.foreground }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={3} y={3} width={18} height={18} rx={1} />
      <Path d="M13 3 9 9" />
      <Path d="M9 9 4 8" />
      <Path d="M9 9 6 14" />
      <Path d="M9 9 12 13" />
      <Path d="M9 9 15 7" />
      <Path d="M12 13 10 18" />
      <Path d="M12 13 16 16" />
      <Path d="M15 7 20 6" />
      <Path d="M15 7 17 12" />
      <Path d="M17 12 21 14" />
    </Svg>
  );
}
