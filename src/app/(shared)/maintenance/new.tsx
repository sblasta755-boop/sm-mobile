import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { SelectField } from "@/components/SelectField";
import { PhotoCapture } from "@/components/PhotoCapture";
import { appAlert } from "@/components/Dialog";
import { useDraft } from "@/features/drafts";
import { useSmartClean } from "@/features/store";
import { MAINTENANCE_SEVERITIES } from "@/domain/maintenance";
import { createMaintenanceJob, type MaintenanceSeverity } from "@/api/client";
import {
  colors,
  radius,
  spacing,
  typography,
  themedStyles,
  useThemeVersion,
} from "@/theme";

const PATHS = ["A contractor", "We fix it ourselves"] as const;
const ANYWHERE = "Anywhere on site";

/**
 * Report a fault. Reachable from the Maintenance list, and from a task or incident (which pass
 * their id so the job can be traced back to where it was found).
 */
export default function NewMaintenanceJobScreen() {
  useThemeVersion();
  const { state, currentUser } = useSmartClean();
  const token = state.accessToken;
  const {
    taskId,
    incidentId,
    checklistItemId,
    locationId: linkedLocationId,
    title: presetTitle,
  } = useLocalSearchParams<{
    taskId?: string;
    incidentId?: string;
    checklistItemId?: string;
    locationId?: string;
    title?: string;
  }>();

  const mySites = state.sites.filter(
    (s) => !currentUser?.siteIds?.length || currentUser.siteIds.includes(s.id),
  );
  const linkedLocation = state.locations.find((l) => l.id === linkedLocationId);
  const draftKey = `maintenance:${taskId ?? incidentId ?? "new"}`;
  const [siteName, setSiteName] = useState(
    state.sites.find((s) => s.id === linkedLocation?.siteId)?.name ??
      mySites[0]?.name ??
      "",
  );
  const [locationName, setLocationName] = useState(
    linkedLocation?.name ?? ANYWHERE,
  );
  const [title, setTitle, clearTitle] = useDraft(
    `${draftKey}:title`,
    presetTitle ?? "",
  );
  const [description, setDescription, clearDescription] = useDraft(
    `${draftKey}:description`,
    "",
  );
  const [severity, setSeverity] = useState<MaintenanceSeverity>("medium");
  const [pathLabel, setPathLabel] = useState<(typeof PATHS)[number]>(PATHS[0]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const site = mySites.find((s) => s.name === siteName);
  const siteLocations = state.locations.filter((l) => l.siteId === site?.id);
  const location = siteLocations.find((l) => l.name === locationName);

  async function submit() {
    if (!token || !site) return;
    setBusy(true);
    try {
      const job = await createMaintenanceJob(token, {
        siteId: site.id,
        locationId: location?.id ?? null,
        title: title.trim(),
        description: description.trim(),
        severity,
        path: pathLabel === PATHS[0] ? "contractor" : "internal",
        origin: taskId
          ? { type: "task", id: taskId, checklistItemId }
          : incidentId
            ? { type: "incident", id: incidentId }
            : { type: "adhoc" },
        photos: photos.map((filePath) => ({ filePath, kind: "issue" })),
      });
      clearTitle();
      clearDescription();
      router.replace(`/maintenance/${job.id}` as never);
    } catch (error) {
      appAlert(
        "Could not report the fault",
        error instanceof Error
          ? error.message
          : "Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Report a fault">
      <View style={styles.form}>
        {mySites.length === 0 ? (
          <Text style={styles.muted}>
            You are not assigned to a site yet. Ask your manager.
          </Text>
        ) : (
          <>
            <SelectField
              label="Site"
              value={siteName}
              options={mySites.map((s) => s.name)}
              onChange={(v) => {
                setSiteName(v);
                setLocationName(ANYWHERE);
              }}
            />
            <SelectField
              label="Place"
              value={locationName}
              options={[ANYWHERE, ...siteLocations.map((l) => l.name)]}
              onChange={setLocationName}
            />

            <View style={styles.field}>
              <Text style={styles.label}>What is wrong</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Stage light flickering"
                placeholderTextColor={colors.mutedForeground}
                style={styles.input}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>More detail (optional)</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={4}
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, styles.textarea]}
              />
            </View>

            <SelectField
              label="How urgent"
              value={severity}
              options={MAINTENANCE_SEVERITIES}
              onChange={(v) => setSeverity(v as MaintenanceSeverity)}
              capitalize
            />
            {severity === "critical" && (
              <Text style={styles.warn}>
                Critical is for safety problems. Managers are told straight
                away.
              </Text>
            )}
            <SelectField
              label="Who fixes it"
              value={pathLabel}
              options={PATHS}
              onChange={(v) => setPathLabel(v as (typeof PATHS)[number])}
            />

            <View style={styles.field}>
              <Text style={styles.label}>Photos</Text>
              <Text style={styles.muted}>
                Taken now, with the camera. They show the approver what is
                wrong.
              </Text>
              {token ? (
                <PhotoCapture
                  token={token}
                  files={photos}
                  onChange={setPhotos}
                />
              ) : null}
            </View>

            <Button
              disabled={busy || !site || title.trim().length < 2}
              loading={busy}
              onPress={submit}
            >
              Report fault
            </Button>
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    form: { gap: spacing.md },
    field: { gap: spacing.xs },
    label: {
      fontSize: typography.small,
      fontWeight: "600",
      color: colors.foreground,
    },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    warn: { fontSize: typography.small, color: colors.destructive },
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
    textarea: { minHeight: 100, textAlignVertical: "top" },
  }),
);
