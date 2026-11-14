import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Path } from "react-native-svg";
import { SignatureDrawer } from "@/components/SignatureDrawer";
import { nameFieldCopy, strokesToPath, type SignoffMode } from "@/domain/signoff";
import type { ItemDraft, ItemRule } from "@/domain/taskWorkflows";
import { colors, radius, spacing, themedStyles, typography, useThemeVersion } from "@/theme";

/**
 * The sign-off part of signing: nothing for a tick, a typed name, a drawn signature, or both, as the rule
 * says. It only collects; the server checks the rules again when it is sent.
 */
export function SignoffBlock({
  rule,
  accountName,
  draft,
  mismatch,
  onChange,
}: {
  rule: ItemRule;
  accountName: string;
  draft: ItemDraft | undefined;
  /** Show the "name must match" message under the name field. */
  mismatch: boolean;
  onChange: (next: ItemDraft) => void;
}) {
  useThemeVersion();
  const [drawerOpen, setDrawerOpen] = useState(false);
  if (rule.mode === "tick") {
    return <Text style={styles.help}>Signing records your name and the time. Nothing to type or draw.</Text>;
  }
  const mode = rule.mode as SignoffMode;
  const given = draft?.signoff ?? { name: "", strokes: [], width: 0, height: 0 };
  const copy = nameFieldCopy({ mode, requireNameMatch: rule.requireNameMatch, accountName });
  const signed = given.strokes.length > 0;

  return (
    <View style={styles.gap}>
      {mode !== "signature" && (
        <View style={styles.gap}>
          <Text style={styles.help}>{copy.label}</Text>
          <TextInput
            value={given.name}
            onChangeText={(name) => onChange({ ...draft, signoff: { ...given, name } })}
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={160}
            placeholder={copy.placeholder}
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, mismatch && styles.inputError]}
            accessibilityLabel={copy.label}
          />
          {mismatch && <Text style={styles.error}>The name must match your account name.</Text>}
        </View>
      )}
      {mode !== "name" && (
        <View style={styles.gap}>
          <Text style={styles.help}>Signature</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={signed ? "Change your signature" : "Tap to sign"}
            style={styles.signatureBox}
            onPress={() => setDrawerOpen(true)}
          >
            {signed ? (
              <Svg width="100%" height="100%" viewBox={`0 0 ${given.width} ${given.height}`}>
                <Path
                  d={strokesToPath(given.strokes)}
                  stroke={colors.foreground}
                  strokeWidth={2.5}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            ) : (
              <View style={styles.signatureEmpty}>
                <Ionicons name="create-outline" size={20} color={colors.primary} />
                <Text style={styles.signatureAdd}>Tap to sign</Text>
              </View>
            )}
          </Pressable>
          {signed && (
            <Pressable
              accessibilityRole="button"
              onPress={() => onChange({ ...draft, signoff: { ...given, strokes: [], width: 0, height: 0 } })}
            >
              <Text style={styles.clearLink}>Clear signature</Text>
            </Pressable>
          )}
          <SignatureDrawer
            visible={drawerOpen}
            initial={signed ? { strokes: given.strokes, width: given.width, height: given.height } : null}
            onClose={() => setDrawerOpen(false)}
            onDone={(result) => {
              onChange({ ...draft, signoff: { ...given, strokes: result.strokes, width: result.width, height: result.height } });
              setDrawerOpen(false);
            }}
          />
        </View>
      )}
    </View>
  );
}

/** A signed item's or task's signature, drawn from the stored path. Nothing for a tick. */
export function SignoffView({
  signoff,
}: {
  signoff: { path: string | null; width: number | null; height: number | null };
}) {
  useThemeVersion();
  if (!signoff.path || !signoff.width || !signoff.height) return null;
  return (
    <View style={styles.view} accessibilityLabel="Signature">
      <Svg width="100%" height="100%" viewBox={`0 0 ${signoff.width} ${signoff.height}`}>
        <Path d={signoff.path} stroke={colors.foreground} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    gap: { gap: spacing.sm },
    help: { fontSize: typography.small, color: colors.mutedForeground },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: typography.body,
      color: colors.foreground,
      backgroundColor: colors.card,
    },
    inputError: { borderColor: colors.destructive },
    error: { color: colors.destructive, fontSize: typography.tiny },
    signatureBox: {
      height: 120,
      borderWidth: 2,
      borderStyle: "dashed",
      borderColor: colors.border,
      borderRadius: radius.lg,
      backgroundColor: colors.card,
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.sm,
    },
    signatureEmpty: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    signatureAdd: { fontSize: typography.body, fontWeight: "700", color: colors.primary },
    clearLink: { fontSize: typography.small, color: colors.mutedForeground, textDecorationLine: "underline" },
    view: {
      marginTop: spacing.xs,
      height: 56,
      width: 160,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.sm,
      padding: 4,
      backgroundColor: colors.card,
    },
  }),
);
