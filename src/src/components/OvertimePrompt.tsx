import { useCallback, useEffect, useState } from "react";
import { AppState, Modal, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { appAlert } from "@/components/Dialog";
import { clearOvertimePrompt, pendingOvertimePrompt, subscribeOvertimePrompt } from "@/features/geofenceClock";
import { enqueueMutation } from "@/features/outbox";
import { useSmartClean } from "@/features/store";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

/**
 * Asked once after shift end, while someone is still on site: "are you working overtime?". A yes
 * with a reason goes to the outbox (so it works with no signal) and on to their supervisor, or to a
 * site manager for a supervisor. A no ends the question; the shift ends as usual. Mounted at the
 * root, shown over whatever screen is open.
 */
export function OvertimePrompt() {
  useThemeVersion();
  const insets = useSafeAreaInsets();
  const { state, currentUser } = useSmartClean();
  const [asked, setAsked] = useState(false);
  const [typing, setTyping] = useState(false);
  const [reason, setReason] = useState("");
  const clockedIn = Boolean(currentUser && state.attendance[currentUser.id]?.clockedInAt);

  const check = useCallback(async () => setAsked((await pendingOvertimePrompt()) !== null), []);
  useEffect(() => {
    void check();
    const unsubscribe = subscribeOvertimePrompt(() => void check());
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") void check();
    });
    return () => {
      unsubscribe();
      sub.remove();
    };
  }, [check]);

  // Someone who has since clocked out has nothing to answer.
  useEffect(() => {
    if (asked && currentUser && !clockedIn) void clearOvertimePrompt();
  }, [asked, clockedIn, currentUser]);

  if (!asked || !currentUser || !clockedIn) return null;

  const close = async () => {
    setTyping(false);
    setReason("");
    await clearOvertimePrompt();
  };
  const send = async () => {
    const text = reason.trim();
    if (!text) return;
    await enqueueMutation({ userId: currentUser.id, kind: "overtime.request", payload: { reason: text, at: new Date().toISOString() } });
    await close();
    appAlert("Sent", "Your supervisor will decide. You stay clocked in until they do.", undefined, "success");
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => undefined}>
      <View style={[styles.backdrop, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Working overtime?</Text>
          <Text style={styles.body}>
            Your shift has ended and you are still on site. If you are staying on, say why and your supervisor will decide. If not, you will
            be clocked out at the end of your shift.
          </Text>
          {typing ? (
            <>
              <TextInput
                style={styles.input}
                value={reason}
                onChangeText={setReason}
                placeholder="Why are you working overtime?"
                placeholderTextColor={colors.mutedForeground}
                multiline
                autoFocus
              />
              <Button onPress={send} disabled={!reason.trim()}>
                Send to my supervisor
              </Button>
              <Button variant="ghost" onPress={() => setTyping(false)}>
                Back
              </Button>
            </>
          ) : (
            <>
              <Button onPress={() => setTyping(true)}>Yes, I am working overtime</Button>
              <Button variant="outline" onPress={close}>
                No, I am finishing
              </Button>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: "center", paddingHorizontal: spacing.xl },
    sheet: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
    title: { fontSize: typography.h2, fontWeight: "700", color: colors.foreground },
    body: { fontSize: typography.body, color: colors.mutedForeground },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      minHeight: 90,
      textAlignVertical: "top",
      color: colors.foreground,
      backgroundColor: colors.card,
      fontSize: 16,
    },
  }),
);
