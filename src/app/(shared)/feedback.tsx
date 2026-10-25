import { useState } from "react";
import { useDraft } from "@/features/drafts";
import { router } from "expo-router";
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { appAlert } from "@/components/Dialog";
import { sendFeedback, uploadImage, type FeedbackPayload } from "@/api/client";
import { APP_VERSION } from "@/constants/version";
import { prepareEvidencePhoto } from "@/services/photoPrep";
import { useSmartClean } from "@/features/store";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

const CATEGORIES: { value: FeedbackPayload["category"]; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "bug", label: "Problem", icon: "bug-outline" },
  { value: "idea", label: "Idea", icon: "bulb-outline" },
  { value: "question", label: "Question", icon: "help-circle-outline" },
  { value: "other", label: "Other", icon: "chatbubble-outline" },
];
const MAX_PHOTOS = 5;

/** Tell the Šoma360 team about a problem or an idea, with screenshots or photos. */
export default function FeedbackScreen() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { state } = useSmartClean();
  // What has been typed is kept on the phone, so a lock or a closed app does not lose it.
  const [category, setCategory, clearCategory] = useDraft<FeedbackPayload["category"]>("feedback:category", "bug");
  const [message, setMessage, clearMessage] = useDraft("feedback:message", "");
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const offline = state.connectivity === "offline";
  const canSend = message.trim().length >= 3 && !busy && !offline;

  async function addFromGallery() {
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: room,
      quality: 1,
    });
    if (result.canceled) return;
    const small = await Promise.all(
      result.assets.slice(0, room).map((asset) => prepareEvidencePhoto(asset.uri, asset.width, asset.height)),
    );
    setPhotos((current) => [...current, ...small].slice(0, MAX_PHOTOS));
  }

  async function addFromCamera() {
    if (photos.length >= MAX_PHOTOS) return;
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      appAlert("Camera not allowed", "Allow camera access in your phone settings to take a photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1 });
    if (result.canceled) return;
    const asset = result.assets[0];
    const small = await prepareEvidencePhoto(asset.uri, asset.width, asset.height);
    setPhotos((current) => [...current, small]);
  }

  async function submit() {
    if (!canSend || !state.accessToken) return;
    setBusy(true);
    try {
      const filePaths: string[] = [];
      for (const [index, uri] of photos.entries()) {
        filePaths.push(await uploadImage(state.accessToken, uri, `feedback-${Date.now()}-${index}.jpg`));
      }
      await sendFeedback(state.accessToken, {
        category,
        message: message.trim(),
        filePaths,
        appVersion: APP_VERSION,
        platform: `${Platform.OS} ${Platform.Version}`,
      });
      appAlert("Thank you", "Your feedback was sent to the Šoma360 team.", [
        { text: "OK", onPress: () => router.back() },
      ]);
      clearMessage();
      clearCategory();
      setPhotos([]);
    } catch (error) {
      // The draft is kept so nothing has to be typed again.
      appAlert("Could not send", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Send feedback" scroll={false}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={styles.label}>What is it about?</Text>
          <View style={styles.chips}>
            {CATEGORIES.map((option) => {
              const selected = category === option.value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setCategory(option.value)}
                  style={[styles.chip, selected && styles.chipOn]}
                >
                  <Ionicons
                    name={option.icon}
                    size={15}
                    color={selected ? colors.primaryForeground : colors.mutedForeground}
                  />
                  <Text style={[styles.chipText, selected && styles.chipTextOn]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Your message</Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Tell us what happened or what would help"
            placeholderTextColor={colors.mutedForeground}
            multiline
            maxLength={4000}
            textAlignVertical="top"
            style={styles.input}
            accessibilityLabel="Your message"
          />

          <Text style={styles.label}>Photos or screenshots (optional)</Text>
          <View style={styles.photos}>
            {photos.map((uri) => (
              <View key={uri} style={styles.photo}>
                <Image source={{ uri }} style={styles.photoImage} />
                <Pressable
                  accessibilityLabel="Remove photo"
                  style={styles.photoRemove}
                  onPress={() => setPhotos((current) => current.filter((p) => p !== uri))}
                >
                  <Ionicons name="close" size={14} color={colors.white} />
                </Pressable>
              </View>
            ))}
            {photos.length < MAX_PHOTOS && (
              <>
                <Pressable style={styles.add} onPress={addFromGallery} accessibilityLabel="Choose photos">
                  <Ionicons name="images-outline" size={22} color={colors.mutedForeground} />
                  <Text style={styles.addText}>Gallery</Text>
                </Pressable>
                <Pressable style={styles.add} onPress={addFromCamera} accessibilityLabel="Take a photo">
                  <Ionicons name="camera-outline" size={22} color={colors.mutedForeground} />
                  <Text style={styles.addText}>Camera</Text>
                </Pressable>
              </>
            )}
          </View>
          <Text style={styles.hint}>Up to {MAX_PHOTOS} photos.</Text>

          {offline && <Text style={styles.warning}>You are offline. Connect to send your feedback.</Text>}
          <Button disabled={!canSend} onPress={submit}>
            {busy ? "Sending..." : "Send feedback"}
          </Button>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    content: { padding: spacing.md },
    label: { fontSize: typography.small, fontWeight: "700", color: colors.mutedForeground, marginBottom: spacing.xs, marginTop: spacing.sm },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: typography.small, color: colors.mutedForeground, fontWeight: "600" },
    chipTextOn: { color: colors.primaryForeground },
    input: {
      minHeight: 130,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.card,
      padding: spacing.sm,
      fontSize: typography.body,
      color: colors.foreground,
    },
    photos: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    photo: { width: 76, height: 76, borderRadius: radius.md, overflow: "hidden" },
    photoImage: { width: "100%", height: "100%" },
    photoRemove: {
      position: "absolute",
      top: 4,
      right: 4,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: "rgba(0,0,0,0.6)",
      alignItems: "center",
      justifyContent: "center",
    },
    add: {
      width: 76,
      height: 76,
      borderRadius: radius.md,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
    },
    addText: { fontSize: 11, color: colors.mutedForeground },
    hint: { fontSize: typography.small, color: colors.mutedForeground, marginTop: spacing.xs, marginBottom: spacing.md },
    warning: { fontSize: typography.small, color: colors.warning, marginBottom: spacing.sm },
  }),
);
