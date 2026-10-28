import { useEffect, useState } from "react";
import { Redirect, router } from "expo-router";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { appAlert } from "@/components/Dialog";
import { listLeaveTypes, requestLeave, uploadImage, type LeaveType } from "@/api/client";
import { dateKey, isPastDay } from "@/domain/schedule";
import { useLeaveOn } from "@/features/leave";
import { useHomePath } from "@/features/roles";
import { useSmartClean } from "@/features/store";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Ask for leave: the kind, the days and, when the kind asks for one, a photo of the medical note.
 * The server counts the working days and checks the balance. */
export default function LeaveNewScreen() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { state } = useSmartClean();
  const on = useLeaveOn();
  const homePath = useHomePath();
  const today = dateKey(new Date());
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [typeId, setTypeId] = useState("");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [half, setHalf] = useState<"" | "am" | "pm">("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!state.accessToken) return;
    listLeaveTypes(state.accessToken)
      .then((rows) => {
        const active = rows.filter((t) => t.active);
        setTypes(active);
        setTypeId((current) => current || active[0]?.id || "");
      })
      .catch(() => setTypes([]));
  }, [state.accessToken]);

  if (!on) return <Redirect href={homePath as never} />;

  const type = types.find((t) => t.id === typeId);
  const single = from === to;
  const datesOk = DAY.test(from) && DAY.test(to) && to >= from;
  const inPast = DAY.test(from) && isPastDay(from);

  const attach = async () => {
    if (!state.accessToken) return;
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      appAlert("Camera not allowed", "Allow camera access in your phone settings to take a photo of the note.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (result.canceled) return;
    setUploading(true);
    try {
      setNote(await uploadImage(state.accessToken, result.assets[0].uri, `leave-note-${Date.now()}.jpg`));
    } catch (error) {
      appAlert("Could not upload the note", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!state.accessToken || !type) return;
    setBusy(true);
    try {
      await requestLeave(state.accessToken, {
        typeId: type.id,
        startDate: from,
        endDate: to,
        halfDay: single && half ? half : null,
        reason,
        noteUrl: note,
      });
      appAlert("Leave requested", "Your supervisor has been told. You will hear when it is decided.", [{ text: "OK", onPress: () => router.back() }], "success");
    } catch (error) {
      appAlert("Could not send", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Ask for leave">
      <Card style={styles.card}>
        <Text style={styles.heading}>What kind?</Text>
        <View style={styles.chips}>
          {types.map((t) => (
            <Pressable
              key={t.id}
              accessibilityRole="button"
              accessibilityState={{ selected: t.id === typeId }}
              style={[styles.chip, t.id === typeId && styles.chipOn]}
              onPress={() => setTypeId(t.id)}
            >
              <Text style={[styles.chipText, t.id === typeId && styles.chipTextOn]}>{t.name}</Text>
            </Pressable>
          ))}
        </View>
        {type && !type.paid && <Text style={styles.muted}>Unpaid: these days are not paid.</Text>}

        <Text style={styles.heading}>When?</Text>
        <View style={styles.chips}>
          {([["Today", 0], ["Tomorrow", 1]] as const).map(([label, add]) => {
            const d = new Date();
            d.setDate(d.getDate() + add);
            return (
              <Pressable key={label} style={styles.chip} onPress={() => { setFrom(dateKey(d)); setTo(dateKey(d)); }}>
                <Text style={styles.chipText}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.pair}>
          <TextInput style={[styles.input, styles.flex]} value={from} onChangeText={(v) => { setFrom(v); if (to < v) setTo(v); }} placeholder="From 2026-11-03" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" accessibilityLabel="From" />
          <TextInput style={[styles.input, styles.flex]} value={to} onChangeText={setTo} placeholder="To 2026-11-05" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" accessibilityLabel="To" />
        </View>
        {single && (
          <View style={styles.chips}>
            {([["", "Whole day"], ["am", "Morning"], ["pm", "Afternoon"]] as const).map(([value, label]) => (
              <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected: half === value }} style={[styles.chip, half === value && styles.chipOn]} onPress={() => setHalf(value)}>
                <Text style={[styles.chipText, half === value && styles.chipTextOn]}>{label}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <Text style={styles.muted}>Weekends and public holidays are not counted. The days are worked out for you.</Text>
        {inPast && <Text style={styles.error}>Leave cannot start in the past. Ask a manager to record it.</Text>}
        {!datesOk && <Text style={styles.error}>Dates look like 2026-11-03, and the last day cannot be before the first.</Text>}

        <Text style={styles.heading}>Reason (optional)</Text>
        <TextInput style={[styles.input, styles.multiline]} value={reason} onChangeText={setReason} multiline placeholder="Anything your supervisor should know" placeholderTextColor={colors.mutedForeground} />

        {type?.noteAfterDays != null && (
          <>
            <Text style={styles.heading}>Medical note</Text>
            <Text style={styles.muted}>
              Needed when {type.name.toLowerCase()} is longer than {type.noteAfterDays} days. Take a photo of the note.
            </Text>
            <Button variant="outline" disabled={uploading} onPress={attach} icon={<Ionicons name="camera-outline" size={18} color={colors.primary} />}>
              {note ? "Take the photo again" : "Take a photo of the note"}
            </Button>
            {note && <Text style={styles.ok}>Note attached.</Text>}
          </>
        )}
      </Card>
      <Button disabled={busy || uploading || !type || !datesOk || inPast} onPress={() => void submit()}>
        Send request
      </Button>
    </Screen>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    card: { marginBottom: spacing.md, gap: spacing.sm },
    heading: { fontSize: typography.body, fontWeight: "800", color: colors.foreground, marginTop: spacing.xs },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    error: { fontSize: typography.small, color: colors.destructive },
    ok: { fontSize: typography.small, color: colors.success },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    chip: { paddingHorizontal: spacing.md, minHeight: 40, justifyContent: "center", borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: typography.small, fontWeight: "600", color: colors.mutedForeground },
    chipTextOn: { color: colors.white },
    pair: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    flex: { flex: 1, minWidth: 0 },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.foreground, backgroundColor: colors.card, fontSize: 16, minHeight: 44 },
    multiline: { minHeight: 80, textAlignVertical: "top" },
  }),
);
