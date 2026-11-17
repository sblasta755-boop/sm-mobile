import { useId } from "react";
import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import Svg, { Defs, Pattern, Rect } from "react-native-svg";
import { useTenantBranding } from "@/services/branding";

/**
 * Brand decoration for a tile or shift card: diagonal stripes and a faint copy of the site logo, set
 * in the theme editor's Cards tab (same variables as the web CardDecoration). White at low alpha, so
 * it works on any card colour in light and dark. Renders nothing when neither is on. The parent must
 * clip (overflow hidden); place this before the card's content so the content draws on top.
 */
export function CardDecoration() {
  const { theme, logoUrl } = useTenantBranding();
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const { pattern, logoWatermark } = theme.cards;
  const stripes = pattern === "stripes";
  const watermark = Boolean(logoWatermark && logoUrl);
  if (!stripes && !watermark) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {stripes && (
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
          <Defs>
            <Pattern
              id={`stripes${id}`}
              width={40}
              height={40}
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <Rect width={16} height={40} fill="#ffffff" fillOpacity={0.07} />
            </Pattern>
          </Defs>
          <Rect width="100%" height="100%" fill={`url(#stripes${id})`} />
        </Svg>
      )}
      {watermark && (
        <Image
          source={{ uri: logoUrl as string }}
          contentFit="contain"
          tintColor="#ffffff"
          style={styles.logo}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  logo: {
    position: "absolute",
    right: "-6%",
    bottom: "-14%",
    width: "55%",
    height: "90%",
    opacity: 0.12,
  },
});
