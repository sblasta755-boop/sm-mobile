import { useEffect, useState } from "react";
import { router } from "expo-router";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { useSmartClean } from "@/features/store";
import { toUserRecord, updateUser } from "@/api/client";
import { colors, radius, spacing, typography, themedStyles } from "@/theme";

// Name/email/phone editing for the signed-in user. Phone has no
// dedicated backend column - it round-trips through the JSONB profile
// blob the same way profilePhotoDataUrl already does (see
// apply_user_record/user_to_record in services/records.py on the
// backend), so no backend change was needed to add it here.
export default function EditProfileScreen() {
  const { state, dispatch, currentUser } = useSmartClean();
  const [name, setName] = useState(currentUser?.name ?? "");
  const [email, setEmail] = useState(currentUser?.email ?? "");
  const [phone, setPhone] = useState(currentUser?.phone ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(currentUser?.name ?? "");
    setEmail(currentUser?.email ?? "");
    setPhone(currentUser?.phone ?? "");
  }, [currentUser]);

  async function submit() {
    if (!currentUser || !state.accessToken || !name.trim()) return;
    setSaving(true);
    try {
      const patch = {
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      };
      await updateUser(
        state.accessToken,
        currentUser.id,
        toUserRecord(currentUser, {
          displayName: patch.name,
          email: patch.email,
          phone: patch.phone,
        }),
      );
      dispatch({ type: "UPDATE_USER", userId: currentUser.id, patch });
      router.back();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen title="Edit profile">
      <View style={styles.form}>
        <View style={styles.field}>
          <Text style={styles.label}>Name</Text>
          <TextInput value={name} onChangeText={setName} placeholderTextColor={colors.mutedForeground} style={styles.input} />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholderTextColor={colors.mutedForeground}
            style={styles.input}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Phone number</Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="e.g. +27 82 123 4567"
            placeholderTextColor={colors.mutedForeground}
            style={styles.input}
          />
        </View>
        <Button disabled={saving || !name.trim()} loading={saving} onPress={submit}>
          Save changes
        </Button>
      </View>
    </Screen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  form: {
    gap: spacing.lg,
  },
  field: {
    gap: spacing.xs,
  },
  label: {
    fontSize: typography.small,
    fontWeight: "600",
    color: colors.foreground,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.input,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.body,
    color: colors.foreground,
    backgroundColor: colors.card,
  },
}));
