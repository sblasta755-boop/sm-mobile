import { useState } from "react";
import { router } from "expo-router";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { SelectField } from "@/components/SelectField";
import { useSmartClean } from "@/features/store";
import { newId, nowIso } from "@/services/ids";
import { colors, radius, spacing, typography } from "@/theme";
import type { IncidentPriority } from "@/types/smartclean";

const CATEGORIES = ["Safety", "Security", "Damage", "Complaint", "Lost property", "Maintenance", "Chemical spill", "Missing stock"];
const PRIORITIES: IncidentPriority[] = ["low", "medium", "high", "critical"];

export default function NewIncidentScreen() {
  const { state, dispatch, currentUser } = useSmartClean();
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [priority, setPriority] = useState<IncidentPriority>("medium");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const site = state.sites.find((s) => currentUser?.siteIds.includes(s.id));

  function submit() {
    if (!site) return;
    const id = newId("inc");
    dispatch({
      type: "CREATE_INCIDENT",
      incident: {
        id,
        siteId: site.id,
        locationName: location || "Unknown",
        category,
        priority,
        description,
        ownerId: currentUser?.id ?? "unknown",
        status: "open",
        createdAt: nowIso(),
        offlineOriginated: state.connectivity === "offline",
      },
    });
    router.push("/home");
  }

  return (
    <Screen title="Report incident">
      <View style={styles.form}>
        <SelectField label="Category" value={category} options={CATEGORIES} onChange={setCategory} />
        <SelectField label="Priority" value={priority} options={PRIORITIES} onChange={(v) => setPriority(v as IncidentPriority)} capitalize />

        <View style={styles.field}>
          <Text style={styles.label}>Room / zone</Text>
          <TextInput
            value={location}
            onChangeText={setLocation}
            placeholder="e.g. Reception"
            placeholderTextColor={colors.mutedForeground}
            style={styles.input}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            placeholder="Describe what happened"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, styles.textarea]}
          />
        </View>

        <Button disabled={description.length < 5} onPress={submit}>
          Submit incident
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.md,
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
  textarea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
});
