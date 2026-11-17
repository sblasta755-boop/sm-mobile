import { useEffect, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { appAlert } from "@/components/Dialog";
import {
  AddMemberCard,
  IncidentsCard,
  NoSitesWarning,
  OnShiftCard,
  OverdueCard,
  Pair,
  ShortcutsCard,
  SitesCard,
  SummaryCard,
} from "@/components/home/ManagerCards";
import { HomeEditFrame } from "@/components/home/HomeEditFrame";
import { CustomCard } from "@/components/home/CustomCards";
import { OperationsCard } from "@/components/home/OperationsCards";
import { useHomeSummary, type HomeSummaryApi } from "@/features/useHomeSummary";
import { useHasModule } from "@/features/modules";
import { isOperationsCard, operationsAvailable } from "@/domain/homeSummary";
import { CustomEditor } from "@/components/home/CustomEditor";
import { SiteManagerClockCard } from "@/components/SiteManagerClockCard";
import { useManagerOverviewData, type ManagerOverviewData } from "@/features/managerOverview";
import { useHomeLayout } from "@/features/useHomeLayout";
import { reportTiles } from "@/features/tour";
import {
  cardLabel,
  defaultCards,
  defaultCustom,
  isDefaultCustom,
  isDefaultLayout,
  moveCard,
  setVisible,
  type ResolvedCard,
  type ResolvedCustom,
} from "@/domain/homeLayout";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

/**
 * What a manager needs on opening the app: is anything wrong at my sites, and who is working right now.
 * Laid out like the platform Overview (design M-1, docs/design/manager-home-options). The sections are cards
 * (components/home/ManagerCards.tsx) that the person can show, hide and reorder (design A-1,
 * docs/design/home-widgets-options). With no saved layout, or one this build cannot read, the cards are in today's
 * order, so the screen is exactly what it always was.
 */

/** The card for an id, drawn full width (a miniature in the editor, or on its own in the list). */
function cardNode(id: string, data: ManagerOverviewData, ops: { summary: HomeSummaryApi; attendanceOn: boolean }): ReactNode {
  // The operations cards (not about tasks) draw nothing when their data is left out, so no empty gap.
  if (isOperationsCard(id)) {
    return operationsAvailable(id, ops.summary.status, ops.attendanceOn) ? (
      <OperationsCard id={id} summary={ops.summary} data={data} />
    ) : null;
  }
  switch (id) {
    case "clock":
      return <SiteManagerClockCard />;
    case "summary":
      return <SummaryCard data={data} />;
    case "on_shift":
      return <OnShiftCard data={data} />;
    case "open_incidents":
      return <IncidentsCard data={data} />;
    case "shortcuts":
      return <ShortcutsCard data={data} />;
    case "overdue_tasks":
      return <OverdueCard data={data} />;
    case "sites":
      return <SitesCard data={data} />;
    case "add_member":
      return <AddMemberCard data={data} />;
    default:
      return null;
  }
}

/** The visible cards in order. On shift now and Open incidents next to each other share a row, as they always have. */
function liveCards(cards: ResolvedCard[], data: ManagerOverviewData, ops: { summary: HomeSummaryApi; attendanceOn: boolean }): ReactNode[] {
  const shown = cards.filter((c) => c.visible).map((c) => c.id);
  const out: ReactNode[] = [];
  for (let i = 0; i < shown.length; i++) {
    const id = shown[i];
    const next = shown[i + 1];
    if ((id === "on_shift" && next === "open_incidents") || (id === "open_incidents" && next === "on_shift")) {
      out.push(
        <Pair key={`${id}+${next}`}>
          {id === "on_shift" ? (
            <>
              <OnShiftCard data={data} half />
              <IncidentsCard data={data} half />
            </>
          ) : (
            <>
              <IncidentsCard data={data} half />
              <OnShiftCard data={data} half />
            </>
          )}
        </Pair>,
      );
      i++;
    } else {
      const node = cardNode(id, data, ops);
      if (node != null) out.push(<View key={id}>{node}</View>);
    }
  }
  return out;
}

/** Why a card has no miniature right now, when it has nothing to draw. */
function emptyReason(id: string, data: ManagerOverviewData, ops: { summary: HomeSummaryApi; attendanceOn: boolean }): string | undefined {
  if (isOperationsCard(id) && !operationsAvailable(id, ops.summary.status, ops.attendanceOn)) return "Shows when its information is available to you.";
  if (id === "clock") return "Shown only to site managers whose organisation lets them clock in.";
  if (id === "overdue_tasks" && data.overdue.length === 0) return "Shows when something is overdue.";
  if (id === "shortcuts" && data.shortcuts.length === 0) return "Shows when you have shortcuts available.";
  if (id === "add_member" && data.currentUser?.canOnboardStaff === false) return "Not available for your account.";
  return undefined;
}

export default function ManageHome() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const data = useManagerOverviewData();
  const home = useHomeLayout();
  // Arranging the home is started from Profile > Home screen, which opens this screen with arrange=classic|custom.
  const { arrange: asked } = useLocalSearchParams<{ arrange?: string }>();
  const arrange = asked === "classic" || asked === "custom" ? asked : null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ResolvedCard[]>([]);
  const [customDraft, setCustomDraft] = useState<ResolvedCustom>(home.custom);
  const [editingCustom, setEditingCustom] = useState(false);

  const cards = editing ? draft : home.cards;
  const customOn = home.canCustomise && (arrange ?? home.active) === "custom";
  // The operations cards ask the server only for what the visible ones need.
  const visibleIds = (customOn ? home.custom.cards : cards).filter((c) => c.visible).map((c) => c.id);
  const summary = useHomeSummary(visibleIds);
  const attendanceOn = useHasModule("attendance");
  const ops = { summary, attendanceOn };
  const shortcutsShown = !editing && !customOn && home.cards.some((c) => c.id === "shortcuts" && c.visible);

  // Tell the guided tour what is here, so every shortcut that is on screen still gets a step (and none that is hidden).
  const shortcutKey = shortcutsShown ? data.shortcuts.map((s) => s.key).join("|") : "";
  useEffect(() => {
    reportTiles({
      shown: shortcutsShown ? data.shortcuts.map((s) => ({ key: s.key, label: s.label })) : [],
      rest: [],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortcutKey]);

  const startEdit = () => {
    setDraft(home.cards);
    setEditing(true);
  };
  const backToSettings = () => router.replace("/manage-profile");
  const cancelEdit = () => {
    setEditing(false);
    if (arrange) backToSettings();
  };
  const resetDraft = () =>
    appAlert("Reset to the default home?", "Every card comes back, in the original order.", [
      { text: "Keep my layout", style: "cancel" },
      { text: "Reset", style: "destructive", onPress: () => setDraft(defaultCards()) },
    ]);
  const finish = async () => {
    // Saving drops a Classic home that is just the default, so a person who changes nothing stores nothing, and it
    // keeps the Custom home they may have set up.
    await home.save(draft);
    setEditing(false);
    if (arrange) backToSettings();
  };

  const startCustomEdit = () => {
    setCustomDraft(home.custom);
    setEditingCustom(true);
  };
  const resetCustomDraft = () =>
    appAlert("Reset the custom home?", "The look and every card go back to the default custom home.", [
      { text: "Keep my layout", style: "cancel" },
      { text: "Reset", style: "destructive", onPress: () => setCustomDraft(defaultCustom()) },
    ]);
  const finishCustom = async () => {
    await home.saveCustom(customDraft);
    setEditingCustom(false);
    if (arrange) backToSettings();
  };
  useEffect(() => {
    if (!home.canCustomise || home.locked) return;
    if (arrange === "classic") startEdit();
    if (arrange === "custom") startCustomEdit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrange, home.canCustomise, home.locked]);

  if (editingCustom) {
    return (
      <Screen
        title="Custom home look"
        footer={
          <>
            <View style={styles.footerHalf}>
              <Button
                variant="outline"
                icon={<Ionicons name="refresh-outline" size={18} color={colors.foreground} />}
                onPress={resetCustomDraft}
                disabled={isDefaultCustom(customDraft)}
              >
                Reset look
              </Button>
            </View>
            <View style={styles.footerHalf}>
              <Button onPress={finishCustom}>Save</Button>
            </View>
          </>
        }
      >
        <Pressable accessibilityRole="button" onPress={() => {
            setEditingCustom(false);
            if (arrange) backToSettings();
          }} style={styles.cancel}>
          <Ionicons name="close" size={16} color={colors.foreground} />
          <Text style={styles.chipText}>Cancel</Text>
        </Pressable>
        <CustomEditor draft={customDraft} onChange={setCustomDraft} />
      </Screen>
    );
  }

  if (editing) {
    const onlyOne = draft.filter((c) => c.visible).length <= 1;
    return (
      <Screen
        title="Customise home"
        footer={
          <>
            <View style={styles.footerHalf}>
              <Button
                variant="outline"
                icon={<Ionicons name="refresh-outline" size={18} color={colors.foreground} />}
                onPress={resetDraft}
                disabled={isDefaultLayout(draft)}
              >
                Reset to default
              </Button>
            </View>
            <View style={styles.footerHalf}>
              <Button onPress={finish}>Done</Button>
            </View>
          </>
        }
      >
        <View style={styles.note}>
          <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
          <Text style={styles.noteText}>
            Show, hide and reorder your cards. Saved on this phone first, then synced to your account.
          </Text>
        </View>
        <Pressable accessibilityRole="button" onPress={cancelEdit} style={styles.cancel}>
          <Ionicons name="close" size={16} color={colors.foreground} />
          <Text style={styles.chipText}>Cancel</Text>
        </Pressable>
        {draft.map((card, i) => {
          const reason = emptyReason(card.id, data, ops);
          return (
            <HomeEditFrame
              key={card.id}
              title={cardLabel(card.id)}
              visible={card.visible}
              canMoveUp={i > 0}
              canMoveDown={i < draft.length - 1}
              canHide={!onlyOne}
              onUp={() => setDraft((cur) => moveCard(cur, card.id, -1))}
              onDown={() => setDraft((cur) => moveCard(cur, card.id, 1))}
              onToggle={() => setDraft((cur) => setVisible(cur, card.id, !card.visible))}
              placeholder={reason}
            >
              {cardNode(card.id, data, ops)}
            </HomeEditFrame>
          );
        })}
      </Screen>
    );
  }

  const list = liveCards(cards, data, ops);
  // The warning is not a card: it explains an empty screen, so it always shows. It follows the clock card when that
  // comes first, as it always did.
  const warning = data.needsSiteAssignment ? <NoSitesWarning key="no-sites" /> : null;
  const firstIsClock = cards.find((c) => c.visible)?.id === "clock";

  if (customOn) {
    return (
      <Screen title="Overview">
        {home.locked ? (
          <View style={[styles.chip, styles.chipLocked]}>
            <Ionicons name="lock-closed-outline" size={15} color={colors.mutedForeground} />
            <Text style={[styles.chipText, { color: colors.mutedForeground }]}>Set by your administrator</Text>
          </View>
        ) : (
          null
        )}
        {home.custom.cards
          .filter((c) => c.visible)
          .map((c) =>
            isOperationsCard(c.id) ? (
              // A card with nothing to show (its module is off, or the server left its data out) is not drawn at all.
              operationsAvailable(c.id, summary.status, attendanceOn) ? (
                <OperationsCard key={c.id} id={c.id} summary={summary} data={data} view={c.view} look={home.custom.look} />
              ) : null
            ) : (
              <CustomCard key={c.id} card={c} look={home.custom.look} data={data} />
            ),
          )}
      </Screen>
    );
  }

  return (
    <Screen title="Overview">
      {home.canCustomise ? (
        home.locked ? (
          <View style={[styles.chip, styles.chipLocked]}>
            <Ionicons name="lock-closed-outline" size={15} color={colors.mutedForeground} />
            <Text style={[styles.chipText, { color: colors.mutedForeground }]}>Set by your administrator</Text>
          </View>
        ) : null
      ) : null}
      {firstIsClock ? (
        <>
          {list[0]}
          {warning}
          {list.slice(1)}
        </>
      ) : (
        <>
          {warning}
          {list}
        </>
      )}
    </Screen>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    chip: {
      alignSelf: "flex-end",
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs + 2,
      height: 32,
      paddingHorizontal: spacing.md,
      borderRadius: radius.round,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      marginBottom: spacing.sm,
    },
    chipLocked: { backgroundColor: "transparent" },
    chipText: { fontSize: typography.small + 1, fontWeight: "600", color: colors.foreground },
    cancel: {
      alignSelf: "flex-end",
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs + 2,
      height: 32,
      paddingHorizontal: spacing.md,
      borderRadius: radius.round,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      marginBottom: spacing.md,
    },
    note: {
      flexDirection: "row",
      gap: spacing.sm,
      alignItems: "flex-start",
      backgroundColor: colors.accent,
      borderRadius: radius.xl,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    noteText: { flex: 1, fontSize: typography.small, color: colors.foreground, lineHeight: 19 },
    footerHalf: { flex: 1 },
  }),
);
