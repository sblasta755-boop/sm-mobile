import { useState } from "react";
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { fileUrl, type NoticeAttachment } from "@/api/client";
import { WhenPill } from "@/components/NoticeBits";
import { hexAlpha } from "@/domain/calendarGrid";
import { categoryMeta } from "@/domain/noticeboard";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

type Glyph = keyof typeof Ionicons.glyphMap;

/**
 * How a notice looks to the person reading it: a coloured header with the kind and title, the day and who it is for,
 * the detail, photos shown in full and files as cards. The notice screen and the composer's preview both draw this,
 * so what a creator previews is what people get. Mirrors the web app's NoticeContent.
 */
export function NoticeContent({
  category,
  pinned,
  title,
  byline,
  whenText,
  forText,
  body,
  attachments,
  requiresAck,
  emailed,
}: {
  category: string;
  pinned: boolean;
  title: string;
  byline: string;
  whenText: string;
  forText: string;
  body: string;
  attachments: NoticeAttachment[];
  requiresAck?: boolean;
  emailed?: boolean;
}) {
  useThemeVersion();
  const meta = categoryMeta(category);
  const images = attachments.filter((a) => a.type.startsWith("image/"));
  const files = attachments.filter((a) => !a.type.startsWith("image/"));
  const open = (url: string) => void Linking.openURL(fileUrl(url) ?? "");
  return (
    <View style={{ gap: spacing.md }}>
      <View style={[styles.hero, { borderColor: hexAlpha(meta.color, 0.35) }]}>
        <LinearGradient colors={[hexAlpha(meta.color, 0.2), hexAlpha(meta.color, 0.04)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={[styles.topBar, { backgroundColor: meta.color }]} />
        <View style={styles.kindRow}>
          <View style={[styles.kindIcon, { backgroundColor: hexAlpha(meta.color, 0.2) }]}>
            <Ionicons name={meta.icon as Glyph} size={20} color={meta.color} />
          </View>
          <Text style={[styles.kind, { color: meta.color }]}>{meta.label.toUpperCase()}</Text>
          {pinned && (
            <View style={styles.pinned}>
              <Ionicons name="pin-outline" size={12} color={colors.mutedForeground} />
              <Text style={styles.pinnedText}>Pinned</Text>
            </View>
          )}
        </View>
        <Text style={styles.title}>{title || "Untitled notice"}</Text>
        <Text style={styles.byline}>{byline}</Text>
        <View style={styles.chips}>
          <WhenPill text={whenText} />
          <View style={styles.chip}>
            <Ionicons name="people-outline" size={13} color={colors.foreground} />
            <Text style={styles.chipText}>{forText}</Text>
          </View>
          {requiresAck && (
            <View style={[styles.chip, styles.chipRed]}>
              <Ionicons name="shield-checkmark-outline" size={13} color={colors.destructive} />
              <Text style={[styles.chipText, { color: colors.destructive }]}>Acknowledgement needed</Text>
            </View>
          )}
          {emailed && (
            <View style={styles.chip}>
              <Ionicons name="mail-outline" size={13} color={colors.mutedForeground} />
              <Text style={[styles.chipText, { color: colors.mutedForeground }]}>Also emailed</Text>
            </View>
          )}
        </View>
      </View>

      {!!body && <Text style={styles.body}>{body}</Text>}

      {images.map((a) => (
        <Pressable key={a.url} accessibilityRole="imagebutton" accessibilityLabel={`Open ${a.name}`} onPress={() => open(a.url)}>
          <Photo uri={fileUrl(a.url) ?? ""} />
        </Pressable>
      ))}

      {files.map((a) => (
        <Pressable key={a.url} accessibilityRole="link" onPress={() => open(a.url)} style={styles.file}>
          <View style={styles.fileIcon}>
            <Ionicons name="document-text-outline" size={20} color={colors.primary} />
          </View>
          <Text style={styles.fileName} numberOfLines={1}>
            {a.name}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** A photo that shows a spinner until it has loaded (or a note if it cannot), so a slow image never looks like a hole. */
function Photo({ uri }: { uri: string }) {
  useThemeVersion();
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  return (
    <View style={styles.photoWrap}>
      <Image source={{ uri }} style={styles.photo} resizeMode="cover" onLoad={() => setState("ready")} onError={() => setState("failed")} />
      {state !== "ready" && (
        <View style={styles.photoCover}>
          {state === "failed" ? <Text style={styles.byline}>Could not load the photo</Text> : <ActivityIndicator color={colors.primary} />}
        </View>
      )}
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    hero: { borderWidth: 1, borderRadius: 24, padding: spacing.lg, overflow: "hidden", gap: 6 },
    topBar: { position: "absolute", top: 0, left: 0, right: 0, height: 4 },
    kindRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
    kindIcon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
    kind: { fontSize: 12, fontWeight: "800", letterSpacing: 1 },
    pinned: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, backgroundColor: colors.card },
    pinnedText: { fontSize: 11, fontWeight: "700", color: colors.mutedForeground },
    title: { fontSize: 26, fontWeight: "800", lineHeight: 31, color: colors.foreground, marginTop: spacing.sm },
    byline: { fontSize: typography.small, color: colors.mutedForeground },
    chips: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
    chip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, backgroundColor: colors.card },
    chipRed: { backgroundColor: colors.muted },
    chipText: { fontSize: 12, fontWeight: "700", color: colors.foreground },
    body: { fontSize: 16, lineHeight: 24, color: colors.foreground },
    photoWrap: { width: "100%", height: 240, borderRadius: radius.xl, overflow: "hidden", backgroundColor: colors.muted },
    photoCover: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: colors.muted },
    photo: { width: "100%", height: 240, borderRadius: radius.xl, backgroundColor: colors.muted },
    file: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    fileIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.muted },
    fileName: { flex: 1, fontSize: typography.body, fontWeight: "600", color: colors.foreground },
  }),
);
