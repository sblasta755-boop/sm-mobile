import { useEffect, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { appAlert } from "@/components/Dialog";
import { HomeEditFrame } from "@/components/home/HomeEditFrame";
import { CustomEditor } from "@/components/home/CustomEditor";
import { Seg } from "@/components/home/Seg";
import { TemplateList } from "@/components/home/TemplatePicker";
import { matchingTemplate, templateCustom } from "@/domain/homeTemplates";
import { useSmartClean } from "@/features/store";
import {
  getPlatformHomeLayout,
  getUserHomeLayout,
  putPlatformHomeLayout,
  putUserHomeLayout,
  resetPlatformHomeLayout,
  resetUserHomeLayout,
  type ServerHomeLayout,
} from "@/api/client";
import {
  PHONE_CARDS,
  defaultCards,
  defaultCustom,
  mergeStored,
  moveCard,
  resolveActiveHome,
  resolveCustom,
  resolveLayout,
  setVisible,
  toStored,
  type Home,
  type ResolvedCard,
  type ResolvedCustom,
} from "@/domain/homeLayout";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

/**
 * Arrange someone else's phone home screen (design C-1, on the phone): which home they open on, their Classic home
 * (show, hide, order) or their Custom home (look and how each card shows its data), and optionally lock it so they
 * cannot change it. An organisation admin does this for operations and site managers in their own organisation; the
 * platform operator, by passing `tenantId`, for anyone in a customer organisation. The server checks who may, and
 * records every save in the audit log. The desktop home is arranged from the web console.
 */
export function HomeLayoutAdminScreen({ userId, name, tenantId }: { userId: string; name: string; tenantId?: string }) {
  useThemeVersion();
  const { state } = useSmartClean();
  const token = state.accessToken;
  const first = name.split(" ")[0] || "them";

  const [loading, setLoading] = useState(true);
  const [row, setRow] = useState<ServerHomeLayout | null>(null);
  const [tab, setTab] = useState<Home>("classic");
  const [active, setActive] = useState<Home>("classic");
  const [classic, setClassic] = useState<ResolvedCard[]>(defaultCards());
  const [custom, setCustom] = useState<ResolvedCustom>(defaultCustom());
  const [locked, setLocked] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) return;
    let live = true;
    (tenantId ? getPlatformHomeLayout(token, tenantId, userId) : getUserHomeLayout(token, userId))
      .then(({ homeLayout }) => {
        if (!live) return;
        setRow(homeLayout);
        setClassic(resolveLayout(homeLayout?.layout));
        setCustom(resolveCustom(homeLayout?.layout));
        setActive(resolveActiveHome(homeLayout?.layout));
        setLocked(!!homeLayout?.locked);
      })
      .catch((error) => appAlert("Could not load their home screen", error instanceof Error ? error.message : "Try again."))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [token, tenantId, userId]);

  async function save() {
    if (!token) return;
    setSaving(true);
    try {
      // The same rules as a person saving their own: parts that are just the default are left out.
      let next = mergeStored(row?.layout, { classic, custom, active });
      // A locked layout needs something stored to lock, even when it is exactly the default.
      if (!next && locked) next = toStored(classic);
      if (next) {
        await (tenantId ? putPlatformHomeLayout(token, tenantId, userId, next, locked) : putUserHomeLayout(token, userId, next, locked));
      } else {
        await (tenantId ? resetPlatformHomeLayout(token, tenantId, userId) : resetUserHomeLayout(token, userId));
      }
      appAlert("Saved", `${name}'s home screen was saved${locked ? " and locked" : ""}.`);
      setRow(next ? ({ layout: next, rev: (row?.rev ?? 0) + 1, locked } as ServerHomeLayout) : null);
    } catch (error) {
      appAlert("Could not save", error instanceof Error ? error.message : "Try again.");
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    appAlert(`Reset ${name}'s home?`, "Both homes go back to the default, and any lock is removed.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Reset",
        style: "destructive",
        onPress: async () => {
          if (!token) return;
          try {
            await (tenantId ? resetPlatformHomeLayout(token, tenantId, userId) : resetUserHomeLayout(token, userId));
            setRow(null);
            setClassic(defaultCards());
            setCustom(defaultCustom());
            setActive("classic");
            setLocked(false);
            appAlert("Reset", `${name}'s home screen is back to the default.`);
          } catch (error) {
            appAlert("Could not reset", error instanceof Error ? error.message : "Try again.");
          }
        },
      },
    ]);
  }

  const shown = classic.filter((c) => c.visible).length;

  return (
    <Screen
      title="Edit home screen"
      footer={
        <>
          <View style={styles.half}>
            <Button variant="outline" icon={<Ionicons name="refresh-outline" size={18} color={colors.foreground} />} onPress={reset} disabled={saving || loading}>
              Reset
            </Button>
          </View>
          <View style={styles.half}>
            <Button loading={saving} disabled={loading} onPress={save}>
              Save for {first}
            </Button>
          </View>
        </>
      }
    >
      <View style={styles.note}>
        <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
        <Text style={styles.noteText}>
          Arranging {name}&apos;s phone home screen. Their own changes are replaced. Every change is recorded in the audit log.
        </Text>
      </View>

      {loading ? (
        <Text style={styles.muted}>Loading…</Text>
      ) : (
        <>
          <Text style={styles.section}>Home to edit</Text>
          <Seg<Home>
            full
            label="Home to edit"
            value={tab}
            onChange={setTab}
            options={[
              { id: "classic", label: "Classic home" },
              { id: "custom", label: "Custom home" },
            ]}
          />
          <Text style={styles.section}>Opens on</Text>
          <Seg<Home>
            full
            label="Opens on"
            value={active}
            onChange={setActive}
            options={[
              { id: "classic", label: "Classic" },
              { id: "custom", label: "Custom" },
            ]}
          />

          <Text style={styles.section}>Start from a template</Text>
          <Text style={styles.muted}>Fills the Custom home below. Nothing is saved until you save.</Text>
          <TemplateList
            current={tab === "custom" ? matchingTemplate(custom)?.id : undefined}
            onPick={(t) => {
              setCustom(templateCustom(t));
              setActive("custom");
              setTab("custom");
            }}
          />

          <View style={{ marginTop: spacing.lg }}>
            {tab === "classic" ? (
              classic.map((card, i) => (
                <HomeEditFrame
                  key={card.id}
                  title={PHONE_CARDS.find((c) => c.id === card.id)?.label ?? card.id}
                  visible={card.visible}
                  canMoveUp={i > 0}
                  canMoveDown={i < classic.length - 1}
                  canHide={shown > 1}
                  onUp={() => setClassic((cur) => moveCard(cur, card.id, -1))}
                  onDown={() => setClassic((cur) => moveCard(cur, card.id, 1))}
                  onToggle={() => setClassic((cur) => setVisible(cur, card.id, !card.visible))}
                  placeholder={PHONE_CARDS.find((c) => c.id === card.id)?.hint ?? ""}
                />
              ))
            ) : (
              <CustomEditor draft={custom} onChange={setCustom} />
            )}
          </View>

          <View style={[styles.lock, locked && styles.lockOn]}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.warningForeground} />
            <View style={{ flex: 1 }}>
              <Text style={styles.lockTitle}>Lock this home screen</Text>
              <Text style={styles.muted}>{first} cannot change it. Reset it here to unlock.</Text>
            </View>
            <Switch value={locked} onValueChange={setLocked} accessibilityLabel="Lock this home screen" trackColor={{ true: colors.primary, false: colors.neutral }} />
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    half: { flex: 1 },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    note: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start", backgroundColor: colors.accent, borderRadius: radius.xl, padding: spacing.md, marginBottom: spacing.sm },
    noteText: { flex: 1, fontSize: typography.small, color: colors.foreground, lineHeight: 19 },
    section: { fontSize: typography.tiny, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", color: colors.mutedForeground, marginTop: spacing.lg, marginBottom: spacing.sm },
    lock: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderWidth: 1, borderColor: colors.warning, borderRadius: radius.xl, padding: spacing.md, marginTop: spacing.md },
    lockOn: { backgroundColor: colors.warningSoft },
    lockTitle: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
  }),
);
