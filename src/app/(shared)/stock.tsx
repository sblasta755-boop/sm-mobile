import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { SelectField } from "@/components/SelectField";
import { ProgressBar } from "@/components/ProgressBar";
import { AssignHelpers, HandoverReportView, HandoverStart, useSiteShifts } from "@/components/StockHandover";
import { appAlert } from "@/components/Dialog";
import { StockOverviewView } from "@/components/StockOverviewView";
import { canSeeAllSites, canSeeStockOverview } from "@/domain/stockOverview";
import { useSmartClean } from "@/features/store";
import { useStockAccess } from "@/features/stock";
import { enqueueMutation, useOutbox } from "@/features/outbox";
import { drainQueue } from "@/features/evidenceUploader";
import { loadCachedCount, saveCachedCount } from "@/features/stockCountCache";
import { applyStockCount, pendingStockUse } from "@/domain/outbox";
import { loadSiteSnapshot, saveSiteSnapshot } from "@/features/stockSiteCache";
import {
  ApiError,
  completeStockRestockTask,
  decideStockCountLine,
  giveStockCountReason,
  startStockCount,
  issueStock,
  listStockLevels,
  listStockConversions,
  listStockLocations,
  listStockRestockTasks,
  listStockLoans,
  listStockTransfersInTransit,
  returnStockLoan,
  logStockWaste,
  listStockSuppliers,
  receiveStockDelivery,
  receiveStockFromShop,
  receiveStockTransfer,
} from "@/api/client";
import {
  STOCK_COUNT_REASONS,
  STOCK_WASTE_REASONS,
  type StockConversion,
  type StockCountSession,
  type StockLevel,
  type StockLocation,
  type StockRestockTask,
  type StockLoan,
  type StockQualityIssue,
  type StockSupplier,
  type StockTransfer,
} from "@/types/smartclean";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

type Mode = "overview" | "issue" | "waste" | "restock" | "receive" | "count" | "report";

const MODE_LABELS: Record<Mode, string> = {
  overview: "Overview",
  issue: "Issue",
  waste: "Waste",
  restock: "Restock",
  receive: "Receive",
  count: "Count",
  report: "Handovers",
};

const MODE_ICONS: Record<Mode, keyof typeof Ionicons.glyphMap> = {
  overview: "pie-chart-outline",
  issue: "arrow-up-circle-outline",
  waste: "trash-outline",
  restock: "cart-outline",
  receive: "download-outline",
  count: "clipboard-outline",
  report: "stats-chart-outline",
};

const MODE_HINTS: Record<Mode, string> = {
  overview: "What the stock is worth, what needs attention and what to look at.",
  issue: "Take stock out for a task, round or room.",
  waste: "Record anything spoiled, broken or lost.",
  restock: "Bring these to the carts and stores that are running low.",
  receive: "Book a supplier delivery into the main store.",
  count: "Count at the start of a shift, checked against the last one.",
  report: "How handovers are going: done, missed and what did not match.",
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong");

/**
 * Stock for the people who handle it: issue to a job or room, log waste, and
 * (for storekeepers) work the restock list and receive deliveries. Which
 * modes show comes from the server (useStockAccess), so an organisation that
 * has not switched this role on never sees them.
 */
export default function StockScreen() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { state, currentUser } = useSmartClean();
  const access = useStockAccess();
  const token = state.accessToken;

  const sites = state.sites.filter((s) => currentUser?.siteIds.includes(s.id) || access.manage || canSeeAllSites(currentUser?.role));
  const [siteId, setSiteId] = useState(sites[0]?.id ?? "");
  useEffect(() => {
    if (!siteId && sites[0]) setSiteId(sites[0].id);
  }, [sites, siteId]);

  const modes = useMemo<Mode[]>(
    () => [
      // Insights are for site managers and above.
      ...(canSeeStockOverview(currentUser?.role) ? (["overview"] as Mode[]) : []),
      ...(access.issue ? (["issue", "waste"] as Mode[]) : []),
      ...(access.keep ? (["restock", "receive"] as Mode[]) : []),
      // A helper with issue access can count the lines a supervisor gave them.
      ...(access.keep || access.issue ? (["count"] as Mode[]) : []),
      ...(access.manage ? (["report"] as Mode[]) : []),
    ],
    [access.issue, access.keep, access.manage, currentUser?.role],
  );
  const [mode, setMode] = useState<Mode>(() => (canSeeStockOverview(currentUser?.role) ? "overview" : "issue"));
  useEffect(() => {
    if (modes.length && !modes.includes(mode)) setMode(modes[0]);
  }, [modes, mode]);

  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [levels, setLevels] = useState<StockLevel[]>([]);
  const [restock, setRestock] = useState<StockRestockTask[]>([]);
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  // Stock lent to other sites and not yet back, and stock this site has borrowed.
  const [loans, setLoans] = useState<{ toBeReturned: StockLoan[]; weOwe: StockLoan[] }>({ toBeReturned: [], weOwe: [] });
  const [returning, setReturning] = useState<StockLoan | null>(null);
  const [returnQty, setReturnQty] = useState("");
  const [conversions, setConversions] = useState<StockConversion[]>([]);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!token || !siteId) return;
    let cancelled = false;
    const userId = currentUser?.id ?? "";
    Promise.all([
      listStockLocations(token, siteId),
      listStockLevels(token, siteId),
      listStockRestockTasks(token, siteId).catch(() => []),
      listStockTransfersInTransit(token, siteId).catch(() => []),
      listStockConversions(token, siteId).catch(() => []),
      listStockLoans(token, siteId).catch(() => ({ toBeReturned: [], weOwe: [] })),
    ])
      .then(([nextLocations, nextLevels, nextRestock, nextTransfers, nextConversions, nextLoans]) => {
        if (cancelled) return;
        setLoans(nextLoans);
        setLocations(nextLocations);
        setLevels(nextLevels);
        setRestock(nextRestock);
        setTransfers(nextTransfers);
        setConversions(nextConversions);
        void saveSiteSnapshot(userId, siteId, {
          locations: nextLocations,
          levels: nextLevels,
          restock: nextRestock,
          transfers: nextTransfers,
          conversions: nextConversions,
        });
      })
      .catch(async (error) => {
        if (cancelled) return;
        // No signal: open what the phone last fetched, so stock can still be
        // issued and wasted (those are queued and sent later).
        const snapshot = await loadSiteSnapshot(userId, siteId);
        if (cancelled) return;
        if (snapshot) {
          setLocations(snapshot.locations);
          setLevels(snapshot.levels);
          setRestock(snapshot.restock);
          setTransfers(snapshot.transfers);
          setConversions(snapshot.conversions ?? []);
        } else {
          appAlert("Could not load stock", errorMessage(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, siteId, version, currentUser?.id]);

  const items = useMemo(() => state.stock.filter((item) => item.siteId === siteId), [state.stock, siteId]);
  const itemName = (id: string) => items.find((i) => i.id === id)?.name ?? id;
  const itemUnit = (id: string) => items.find((i) => i.id === id)?.unit ?? "";
  const locationName = (id: string) => locations.find((l) => l.id === id)?.name ?? id;

  const outbox = useOutbox();
  const waitingToSend = outbox.filter((m) => m.userId === (currentUser?.id ?? "") && m.status !== "rejected" && m.kind.startsWith("stock.")).length;
  const summary = [
    ...(access.keep ? [{ label: "To restock", value: restock.length }, { label: "On the way", value: transfers.length }] : []),
    ...(waitingToSend > 0 ? [{ label: "Waiting to send", value: waitingToSend }] : []),
  ];

  if (modes.length === 0) {
    return (
      <Screen title="Stock">
        <Card style={styles.card}>
          <Text style={styles.muted}>Stock isn't set up for your role. Ask your manager if you need it.</Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title="Stock">
      {sites.length > 1 && (
        <SelectField
          label="Site"
          value={sites.find((s) => s.id === siteId)?.name ?? ""}
          options={sites.map((s) => s.name)}
          onChange={(name) => setSiteId(sites.find((s) => s.name === name)?.id ?? siteId)}
        />
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {modes.map((m) => {
          const selected = mode === m;
          const badge = m === "restock" ? restock.length : 0;
          return (
            <Pressable
              key={m}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => setMode(m)}
              style={[styles.tab, selected && styles.tabSelected]}
            >
              <Ionicons name={MODE_ICONS[m]} size={18} color={selected ? colors.primaryForeground : colors.mutedForeground} />
              <Text style={[styles.tabText, selected && styles.tabTextSelected]}>{MODE_LABELS[m]}</Text>
              {badge > 0 && (
                <View style={[styles.tabBadge, selected && styles.tabBadgeSelected]}>
                  <Text style={[styles.tabBadgeText, selected && styles.tabBadgeTextSelected]}>{badge}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
      <Text style={styles.modeHint}>{MODE_HINTS[mode]}</Text>
      {summary.length > 0 && (
        <View style={styles.statRow}>
          {summary.map((stat) => (
            <View key={stat.label} style={styles.stat}>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>
      )}

      {(mode === "issue" || mode === "waste") && (
        <IssueForm
          mode={mode}
          siteId={siteId}
          locations={locations}
          levels={levels}
          items={items}
          onDone={reload}
        />
      )}

      {mode === "restock" && (
        <View style={styles.stack}>
          <SectionTitle icon="cart-outline" title="Restock list" count={restock.length} />
          {restock.length === 0 && <EmptyState icon="checkmark-done-circle-outline" text="Nothing to restock right now." />}
          {restock.map((task) => (
            <Card key={task.id} style={styles.row}>
              <View style={styles.qtyBubble}>
                <Text style={styles.qtyBubbleValue}>{task.qty}</Text>
                <Text style={styles.qtyBubbleUnit} numberOfLines={1}>{itemUnit(task.itemId)}</Text>
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{itemName(task.itemId)}</Text>
                <View style={styles.placeLine}>
                  <Ionicons name="location-outline" size={13} color={colors.mutedForeground} />
                  <Text style={styles.muted}>Bring to {locationName(task.locationId)}</Text>
                </View>
              </View>
              <Button
                fullWidth={false}
                onPress={async () => {
                  try {
                    await completeStockRestockTask(token!, task.id);
                    reload();
                  } catch (error) {
                    appAlert("Could not complete", errorMessage(error));
                  }
                }}
              >
                Picked
              </Button>
            </Card>
          ))}
          <SectionTitle icon="swap-horizontal-outline" title="On the way" count={transfers.length} />
          {transfers.length === 0 && <EmptyState icon="car-outline" text="No stock is on the way." />}
          {transfers.map((transfer) => {
            // A transfer between sites shows at both. Names come with it, since the other site's items and
            // locations are not in this site's lists; only the receiving site confirms it.
            const betweenSites = !!transfer.toSiteId && transfer.toSiteId !== transfer.siteId;
            const incoming = !betweenSites || transfer.toSiteId === siteId;
            return (
            <Card key={transfer.id} style={styles.row}>
              <View style={[styles.qtyBubble, styles.qtyBubbleInfo]}>
                <Text style={[styles.qtyBubbleValue, styles.qtyBubbleValueInfo]}>{transfer.qty}</Text>
                <Text style={[styles.qtyBubbleUnit, styles.qtyBubbleValueInfo]} numberOfLines={1}>{transfer.itemUnit ?? itemUnit(transfer.itemId)}</Text>
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{transfer.itemName ?? itemName(transfer.itemId)}</Text>
                <Text style={styles.muted}>
                  {transfer.fromLocationName ?? locationName(transfer.fromLocationId)}
                  {betweenSites && transfer.fromSiteName ? ` (${transfer.fromSiteName})` : ""} →{" "}
                  {transfer.toLocationId
                    ? (transfer.toLocationName ?? locationName(transfer.toLocationId))
                    : (transfer.toSiteName ?? "another site")}
                  {transfer.toLocationId && betweenSites && transfer.toSiteName ? ` (${transfer.toSiteName})` : ""}
                </Text>
                {transfer.loan && <Text style={styles.muted}>A loan: expected back</Text>}
              </View>
              {incoming ? (
                <Button
                  fullWidth={false}
                  variant="outline"
                  onPress={async () => {
                    try {
                      await receiveStockTransfer(token!, transfer.id);
                      reload();
                    } catch (error) {
                      appAlert("Could not confirm", errorMessage(error));
                    }
                  }}
                >
                  Got it
                </Button>
              ) : (
                <Text style={styles.muted}>Waiting for them</Text>
              )}
            </Card>
            );
          })}
          <SectionTitle icon="return-down-back-outline" title="Stock to be returned to us" count={loans.toBeReturned.length} />
          {loans.toBeReturned.length === 0 ? (
            <EmptyState icon="hand-left-outline" text="Nothing is out on loan." />
          ) : (
            <Text style={styles.muted}>Lent to other sites. Follow up until it comes back.</Text>
          )}
          {loans.toBeReturned.map((loan) => (
            <Card key={loan.transferId} style={styles.row}>
              <View style={[styles.qtyBubble, styles.qtyBubbleInfo]}>
                <Text style={[styles.qtyBubbleValue, styles.qtyBubbleValueInfo]}>{loan.owed}</Text>
                <Text style={[styles.qtyBubbleUnit, styles.qtyBubbleValueInfo]} numberOfLines={1}>{loan.itemUnit ?? ""}</Text>
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{loan.itemName}</Text>
                <Text style={styles.muted}>{loan.borrowerSiteName}</Text>
                <Text style={styles.muted}>
                  {loan.status === "in_transit" ? "On the way to them" : `Lent ${loan.ageDays <= 0 ? "today" : `${loan.ageDays} day${loan.ageDays === 1 ? "" : "s"} ago`}`}
                  {loan.owed !== loan.qty ? ` · ${loan.owed} of ${loan.qty} still out` : ""}
                  {loan.comingBack ? ` · ${loan.comingBack} on its way back` : ""}
                </Text>
              </View>
            </Card>
          ))}
          <SectionTitle icon="arrow-undo-outline" title="Stock we owe back" count={loans.weOwe.length} />
          {loans.weOwe.length === 0 && <EmptyState icon="checkmark-circle-outline" text="You do not owe any other site stock." />}
          {loans.weOwe.map((loan) => (
            <Card key={loan.transferId} style={styles.row}>
              <View style={[styles.qtyBubble, styles.qtyBubbleInfo]}>
                <Text style={[styles.qtyBubbleValue, styles.qtyBubbleValueInfo]}>{loan.owed}</Text>
                <Text style={[styles.qtyBubbleUnit, styles.qtyBubbleValueInfo]} numberOfLines={1}>{loan.itemUnit ?? ""}</Text>
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{loan.itemName}</Text>
                <Text style={styles.muted}>from {loan.lenderSiteName}</Text>
                {loan.status === "in_transit" && <Text style={styles.muted}>Not received yet. Tap Got it above first.</Text>}
                {loan.comingBack ? <Text style={styles.muted}>{loan.comingBack} on its way back</Text> : null}
              </View>
              {loan.status === "received" && loan.outstanding > 0 && (
                <Button
                  fullWidth={false}
                  variant="outline"
                  onPress={() => {
                    setReturnQty(String(loan.outstanding));
                    setReturning(loan);
                  }}
                >
                  Send back
                </Button>
              )}
            </Card>
          ))}
        </View>
      )}

      <Modal visible={returning !== null} transparent animationType="fade" onRequestClose={() => setReturning(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setReturning(null)}>
          <Pressable style={styles.modalSheet} onPress={() => undefined}>
            <Text style={styles.heading}>Send {returning?.itemName} back</Text>
            <Text style={styles.muted}>
              To {returning?.lenderSiteName}. {returning?.outstanding} left to send back. They confirm it when it arrives.
            </Text>
            <TextInput
              style={styles.modalInput}
              value={returnQty}
              onChangeText={setReturnQty}
              keyboardType="number-pad"
              autoFocus
              accessibilityLabel="How many are you sending back"
            />
            <View style={styles.modalButtons}>
              <Button fullWidth={false} variant="outline" onPress={() => setReturning(null)}>
                Cancel
              </Button>
              <Button
                fullWidth={false}
                onPress={async () => {
                  const loan = returning;
                  const qty = Number(returnQty);
                  if (!loan || !token) return;
                  if (!Number.isInteger(qty) || qty < 1 || qty > loan.outstanding) {
                    appAlert("Check the number", `Enter a whole number from 1 to ${loan.outstanding}.`);
                    return;
                  }
                  try {
                    await returnStockLoan(token, loan.transferId, qty);
                    setReturning(null);
                    appAlert("On its way back", "They confirm it when it arrives.", undefined, "success");
                    reload();
                  } catch (error) {
                    appAlert("Could not send it back", errorMessage(error));
                  }
                }}
              >
                Send back
              </Button>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {mode === "overview" && <StockOverviewView siteId={siteId} />}

      {mode === "report" && <HandoverReportView siteId={siteId} />}

      {mode === "count" && <CountView siteId={siteId} locations={locations} items={items} canApprove={access.manage} canSubmit={access.keep} onDone={reload} />}

      {mode === "receive" && (
        <ReceiveView
          siteId={siteId}
          shops={sites.filter((s) => s.id !== siteId)}
          locations={locations}
          items={items}
          conversions={conversions}
          onDone={reload}
        />
      )}
    </Screen>
  );
}

function SectionTitle({ icon, title, count }: { icon: keyof typeof Ionicons.glyphMap; title: string; count?: number }) {
  return (
    <View style={styles.sectionTitle}>
      <Ionicons name={icon} size={18} color={colors.primary} />
      <Text style={styles.heading}>{title}</Text>
      {count ? (
        <View style={styles.countPill}>
          <Text style={styles.countPillText}>{count}</Text>
        </View>
      ) : null}
    </View>
  );
}

function EmptyState({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={28} color={colors.mutedForeground} />
      <Text style={styles.muted}>{text}</Text>
    </View>
  );
}

/** A titled group of fields, so a long form reads as a few small steps. */
function FormSection({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <Card style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={styles.stepDot}>
          <Text style={styles.stepDotText}>{step}</Text>
        </View>
        <Text style={styles.sectionHeadText}>{title}</Text>
      </View>
      <View style={styles.stack}>{children}</View>
    </Card>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, on && styles.segmentOn]}
          >
            <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Big plus and minus buttons so a quantity never needs the keyboard. */
function QtyStepper({ label, value, onChange, hint, tone }: { label: string; value: string; onChange: (v: string) => void; hint?: string; tone?: "ok" | "low" }) {
  const n = Number(value) || 0;
  return (
    <View style={styles.field}>
      <View style={styles.stepperHead}>
        <Text style={styles.label}>{label}</Text>
        {hint ? (
          <View style={[styles.hintPill, tone === "low" && styles.hintPillLow]}>
            <Text style={[styles.hintPillText, tone === "low" && styles.hintPillTextLow]}>{hint}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.stepper}>
        <Pressable accessibilityRole="button" accessibilityLabel="Less" onPress={() => onChange(String(Math.max(0, n - 1)))} style={styles.stepBtn}>
          <Ionicons name="remove" size={22} color={colors.primary} />
        </Pressable>
        <TextInput
          style={styles.stepInput}
          keyboardType="number-pad"
          value={value}
          onChangeText={(text) => onChange(text.replace(/[^0-9]/g, ""))}
          placeholderTextColor={colors.mutedForeground}
          selectTextOnFocus
        />
        <Pressable accessibilityRole="button" accessibilityLabel="More" onPress={() => onChange(String(n + 1))} style={styles.stepBtn}>
          <Ionicons name="add" size={22} color={colors.primary} />
        </Pressable>
      </View>
    </View>
  );
}

/** Today's cycle count, one line at a time. The expected quantity is not
 * shown until the count is submitted; variances outside tolerance then ask
 * for a reason, and expensive ones wait for a supervisor.
 *
 * Counting works with no signal: the list is fetched once while online and
 * kept on the phone, figures and the submission are queued (the same outbox
 * as tasks) and sent when the connection returns. Reasons and approvals
 * need the server's answer, so those are online-only. */
function CountView({
  siteId,
  locations,
  items,
  canApprove,
  canSubmit,
  onDone,
}: {
  siteId: string;
  locations: StockLocation[];
  items: { id: string; name: string; unit: string }[];
  canApprove: boolean;
  canSubmit: boolean;
  onDone: () => void;
}) {
  const { state, currentUser } = useSmartClean();
  const outbox = useOutbox();
  const token = state.accessToken;
  const userId = currentUser?.id ?? "";
  const today = useMemo(() => new Date().toLocaleDateString("en-CA"), []);
  const [base, setBase] = useState<StockCountSession | null>(null);
  const [entries, setEntries] = useState<Record<string, string>>({});
  const { shifts } = useSiteShifts(siteId);

  const waiting = outbox.filter((m) => m.userId === userId && m.status !== "rejected" && m.kind.startsWith("stock.count")).length;
  const { session: count, submitPending } = useMemo(
    () => (base ? applyStockCount(base, outbox, userId) : { session: null, submitPending: false }),
    [base, outbox, userId],
  );

  const keep = useCallback(
    (next: StockCountSession) => {
      setBase(next);
      void saveCachedCount(userId, siteId, next);
    },
    [userId, siteId],
  );

  // Today's count from the server (or a new one). Returns false with no signal.
  const fetchCount = useCallback(async (options: { kind?: "handover" | "cycle"; shiftId?: string } = {}): Promise<boolean> => {
    if (!token) return false;
    try {
      keep(await startStockCount(token, siteId, options));
      return true;
    } catch (error) {
      if (error instanceof ApiError) appAlert("Could not open the count", errorMessage(error));
      return false;
    }
  }, [token, siteId, keep]);

  // Reopen what is on the phone first, so the count is there with no signal,
  // then bring it up to date if there is one.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cached = await loadCachedCount(userId, siteId, today);
      if (cancelled) return;
      setBase(cached);
      if (cached) await fetchCount({ kind: cached.kind, shiftId: cached.kind === "handover" ? (cached.shiftId ?? undefined) : undefined });
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, siteId, today, fetchCount]);

  // Once the queued figures have gone up, show what the server now says.
  const hadWaiting = useRef(false);
  useEffect(() => {
    if (waiting > 0) hadWaiting.current = true;
    else if (hadWaiting.current && base) {
      hadWaiting.current = false;
      void fetchCount().then(onDone);
    }
  }, [waiting, base, fetchCount, onDone]);

  const apply = async (work: () => Promise<StockCountSession>) => {
    try {
      keep(await work());
      onDone();
    } catch (error) {
      appAlert("Could not update the count", errorMessage(error));
    }
  };

  const queue = async (kind: "stock.count.enter" | "stock.count.submit", payload: Record<string, unknown>) => {
    await enqueueMutation({ userId, kind, payload });
    void drainQueue();
  };

  if (!count) {
    const begin = async (options: { kind?: "handover" | "cycle"; shiftId?: string }) => {
      if (!(await fetchCount(options)) && state.connectivity === "offline") {
        appAlert("No connection", "Today's list is built on the server, so you need a connection to start the count. After that you can count offline.");
      }
    };
    if (!canSubmit) {
      return (
        <View style={styles.stack}>
          <Text style={styles.muted}>Open the count to see the lines a supervisor has given you to count.</Text>
          <Button onPress={() => begin({})}>Open my lines</Button>
        </View>
      );
    }
    return (
      <View style={styles.stack}>
        <HandoverStart shifts={shifts} onStart={begin} />
        <Text style={styles.muted}>
          You won't see what the system expects until you submit. Once the list is on your phone you can count with no signal.
        </Text>
        {canApprove && shifts.length === 0 && (
          <Text style={styles.muted}>
            This site has no shifts yet. Set them up under Schedule (Book staff, then Shifts) to run shift handover counts. Until then you can run a spot check.
          </Text>
        )}
      </View>
    );
  }

  const name = (id: string) => items.find((i) => i.id === id)?.name ?? id;
  const place = (id: string) => locations.find((l) => l.id === id)?.name ?? id;
  const open = count.status === "open" && !submitPending;
  // A helper sees and counts only the lines a supervisor gave them.
  const visibleLines = canSubmit ? count.lines : count.lines.filter((l) => l.assigneeId === userId);
  const allCounted = visibleLines.every((l) => l.counted != null);
  const counted = visibleLines.filter((l) => l.counted != null).length;

  return (
    <View style={styles.stack}>
      <Card style={styles.section}>
        <View style={styles.sectionHead}>
          <Ionicons name="clipboard-outline" size={18} color={colors.primary} />
          <Text style={styles.sectionHeadText}>
            {count.kind === "handover" ? `${count.shiftName ?? "Shift"} handover, ` : "Spot check, "}
            {count.countDate} · {count.status === "open" ? (submitPending ? "Submitted" : "Counting") : count.status === "closed" ? "Closed" : "Resolving variances"}
          </Text>
        </View>
        {count.status === "open" && (
          <>
            <ProgressBar value={visibleLines.length ? (counted / visibleLines.length) * 100 : 0} />
            <Text style={styles.muted}>
              {counted} of {visibleLines.length} counted
            </Text>
          </>
        )}
      </Card>
      {waiting > 0 && (
        <Text style={styles.muted}>
          {submitPending
            ? "Count submitted on this phone - it will go to the server as soon as there is a connection."
            : "Saved on this phone - it will go to the server as soon as there is a connection."}
        </Text>
      )}
      {count.kind === "handover" && count.status === "open" && canApprove && count.lines.length > 0 && (
        <AssignHelpers count={count} locationName={place} onChanged={keep} />
      )}
      {visibleLines.length === 0 && (
        <EmptyState
          icon="clipboard-outline"
          text={
            canSubmit
              ? "Nothing to count yet. Products are picked from stock held in a store or cart at this site. Record a delivery on the Receive tab, then open Count again."
              : "No lines have been assigned to you yet. Ask your supervisor to give you some, then open Count again."
          }
        />
      )}
      {visibleLines.map((line) => (
        <Card key={line.id} style={[styles.countCard, line.counted != null && count.status === "open" && styles.countDone]}>
          <Text style={styles.rowTitle}>{name(line.itemId)}</Text>
          <View style={styles.placeLine}>
            <Ionicons name="location-outline" size={13} color={colors.mutedForeground} />
            <Text style={styles.muted}>{place(line.locationId)}</Text>
          </View>
          {count.status === "open" ? (
            <View style={styles.countRow}>
              <TextInput
                style={[styles.input, styles.countInput]}
                keyboardType="number-pad"
                placeholder="Counted"
                placeholderTextColor={colors.mutedForeground}
                editable={open && (canSubmit || line.assigneeId === userId)}
                value={entries[line.id] ?? (line.counted != null ? String(line.counted) : "")}
                onChangeText={(text) => setEntries({ ...entries, [line.id]: text.replace(/[^0-9]/g, "") })}
                onEndEditing={() => {
                  const value = entries[line.id];
                  if (value) void queue("stock.count.enter", { countId: count.id, lineId: line.id, counted: Number(value) });
                }}
              />
              {line.counted != null && <Ionicons name="checkmark-circle" size={24} color={colors.success} />}
            </View>
          ) : (
            <>
              {count.kind === "handover" && line.previousCounted != null && (
                <Text style={styles.muted}>
                  Last shift counted {line.previousCounted}, then {(line.movementNet ?? 0) > 0 ? `+${line.movementNet}` : (line.movementNet ?? 0)} recorded since
                </Text>
              )}
              <Text style={styles.muted}>
                Expected {line.expected} · counted {line.counted} · {line.variance ? (line.variance > 0 ? `+${line.variance}` : line.variance) : "matches"}
              </Text>
              {line.status === "needs_reason" && (
                <SelectField
                  label="Why is it different?"
                  value=""
                  options={STOCK_COUNT_REASONS.map(([, label]) => label)}
                  onChange={(label) => {
                    const code = STOCK_COUNT_REASONS.find(([, l]) => l === label)?.[0];
                    if (code) void apply(() => giveStockCountReason(token!, count.id, line.id, code));
                  }}
                />
              )}
              {line.status === "awaiting_approval" && (
                <View style={styles.countRow}>
                  <Text style={[styles.muted, styles.rowText]}>Waiting for a supervisor</Text>
                  {canApprove && (
                    <>
                      <Button fullWidth={false} onPress={() => apply(() => decideStockCountLine(token!, count.id, line.id, true))}>
                        Approve
                      </Button>
                      <Button fullWidth={false} variant="outline" onPress={() => apply(() => decideStockCountLine(token!, count.id, line.id, false))}>
                        Reject
                      </Button>
                    </>
                  )}
                </View>
              )}
            </>
          )}
        </Card>
      ))}
      {open && canSubmit && count.lines.length > 0 && (
        <Button disabled={!allCounted} onPress={() => queue("stock.count.submit", { countId: count.id })}>
          {allCounted ? "Submit count" : `Count ${count.lines.length - counted} more to submit`}
        </Button>
      )}
    </View>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        keyboardType="number-pad"
        value={value}
        onChangeText={(text) => onChange(text.replace(/[^0-9]/g, ""))}
        placeholderTextColor={colors.mutedForeground}
      />
    </View>
  );
}

/** Two taps in the common case: the location defaults to the person's own
 * cart or store, then pick the item and quantity, then what it was for. */
function IssueForm({
  mode,
  siteId,
  locations,
  levels,
  items,
  onDone,
}: {
  mode: "issue" | "waste";
  siteId: string;
  locations: StockLocation[];
  levels: StockLevel[];
  items: { id: string; name: string; unit: string }[];
  onDone: () => void;
}) {
  const { state, currentUser } = useSmartClean();
  const mine = locations.filter((l) => l.assigneeIds.includes(currentUser?.id ?? ""));
  const choices = mine.length ? mine : locations;
  const [locationName, setLocationName] = useState("");
  const [itemName, setItemName] = useState("");
  const [qty, setQty] = useState("1");
  const [refType, setRefType] = useState<"task" | "round" | "location">("task");
  const [refName, setRefName] = useState("");
  const [reason, setReason] = useState<string>(STOCK_WASTE_REASONS[0]);

  useEffect(() => {
    if (!locationName && choices[0]) setLocationName(choices[0].name);
  }, [choices, locationName]);

  const location = choices.find((l) => l.name === locationName);
  const item = items.find((i) => i.name === itemName);
  // What is waiting to send comes off the figure shown: the last fetch cannot know about it.
  const outbox = useOutbox();
  const waitingUse = pendingStockUse(outbox, currentUser?.id ?? "").get(`${item?.id}|${location?.id}`) ?? 0;
  const onHand = (levels.find((l) => l.itemId === item?.id && l.locationId === location?.id)?.qty ?? 0) - waitingUse;

  const openTasks = state.tasks.filter(
    (t) => t.siteId === siteId && !["approved", "closed", "failed", "cancelled", "submitted"].includes(t.status),
  );
  const rooms = state.locations.filter((l) => l.siteId === siteId);
  // A cleaning round is an hourly-compliance round; a plain task is anything else.
  const roundLabel = (t: (typeof openTasks)[number]) => `${t.title}${t.hourlyComplianceSlot ? ` (${t.hourlyComplianceSlot})` : ""}`;
  const refOptions =
    refType === "task"
      ? openTasks.filter((t) => !t.isHourlyCompliance).map((t) => t.title)
      : refType === "round"
        ? openTasks.filter((t) => t.isHourlyCompliance).map(roundLabel)
        : rooms.map((r) => r.name);

  const submit = async () => {
    const quantity = Number(qty);
    if (!state.accessToken || !location || !item || quantity < 1) {
      appAlert("Missing details", "Pick the location, product and quantity.");
      return;
    }
    let referenceId: string | undefined;
    if (mode === "issue") {
      referenceId =
        refType === "task"
          ? openTasks.find((t) => !t.isHourlyCompliance && t.title === refName)?.id
          : refType === "round"
            ? openTasks.find((t) => t.isHourlyCompliance && roundLabel(t) === refName)?.id
            : rooms.find((r) => r.name === refName)?.id;
      if (!referenceId) {
        appAlert("Missing details", "Say which job, round or room the stock is for.");
        return;
      }
    }
    // The same reference goes with every attempt, so a request whose answer was
    // lost can be sent again without booking the stock twice.
    const clientRef = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    const occurredAt = new Date().toISOString();
    const base = { itemId: item.id, locationId: location.id, qty: quantity, clientRef, occurredAt };
    const queueIt = async () => {
      await enqueueMutation({
        userId: currentUser?.id ?? "",
        kind: mode === "issue" ? "stock.issue" : "stock.waste",
        payload: mode === "issue" ? { ...base, referenceType: refType, referenceId } : { ...base, reasonCode: reason.toLowerCase() },
      });
      void drainQueue();
      appAlert("Saved on this phone", "It will go to the server as soon as there is a connection.", undefined, "success");
      setQty("1");
    };
    try {
      if (state.connectivity === "offline") {
        await queueIt();
        return;
      }
      let negative = false;
      if (mode === "issue") {
        negative = (await issueStock(state.accessToken, { ...base, referenceType: refType, referenceId: referenceId! })).negative;
      } else {
        negative = (await logStockWaste(state.accessToken, { ...base, reasonCode: reason.toLowerCase() })).negative;
      }
      appAlert(
        negative ? "Saved - check the count" : mode === "issue" ? "Issued" : "Waste logged",
        negative ? "This location is now below zero, so a receipt or transfer may be missing." : undefined,
        undefined,
        negative ? "warning" : "success",
      );
      setQty("1");
      onDone();
    } catch (error) {
      // No answer from the server (not a refusal): keep it and send it later.
      if (!(error instanceof ApiError)) {
        await queueIt();
        return;
      }
      appAlert("Could not save", errorMessage(error));
    }
  };

  const quantity = Number(qty) || 0;
  const low = Boolean(item) && quantity > onHand;

  return (
    <View style={styles.stack}>
      <FormSection step={1} title={mode === "issue" ? "Take it from" : "Where was it"}>
        <SelectField label="Location" value={locationName} options={choices.map((l) => l.name)} onChange={setLocationName} />
      </FormSection>
      <FormSection step={2} title="What and how many">
        <SelectField label="Product" value={itemName} options={items.map((i) => i.name)} onChange={setItemName} />
        <QtyStepper
          label="Quantity"
          value={qty}
          onChange={setQty}
          hint={item ? `${onHand} ${item.unit} on hand` : undefined}
          tone={low ? "low" : "ok"}
        />
        {low && <Text style={styles.lowNote}>That is more than the {onHand} on hand. You can still save it, and the count will flag it.</Text>}
      </FormSection>
      <FormSection step={3} title={mode === "issue" ? "What it is for" : "Why"}>
        {mode === "issue" ? (
          <>
            <Segmented
              value={refType}
              options={[
                { value: "task", label: "Task" },
                { value: "round", label: "Round" },
                { value: "location", label: "Room" },
              ]}
              onChange={(value) => {
                setRefType(value);
                setRefName("");
              }}
            />
            <SelectField label={refType === "task" ? "Which task" : refType === "round" ? "Which round" : "Which room"} value={refName} options={refOptions} onChange={setRefName} />
          </>
        ) : (
          <SelectField label="Reason" value={reason} options={STOCK_WASTE_REASONS} onChange={setReason} />
        )}
      </FormSection>
      <Button onPress={submit} icon={<Ionicons name={mode === "issue" ? "arrow-up-circle" : "trash"} size={18} color={colors.primaryForeground} />}>
        {mode === "issue" ? "Issue stock" : "Log waste"}
      </Button>
    </View>
  );
}

/** Receiving starts with an Add button: stock comes either from a supplier (a delivery) or from
 * another shop (returned or extra stock, rebates, the owner's own stock). */
function ReceiveView({
  siteId,
  shops,
  locations,
  items,
  conversions,
  onDone,
}: {
  siteId: string;
  shops: { id: string; name: string }[];
  locations: StockLocation[];
  items: { id: string; name: string; unit: string }[];
  conversions: StockConversion[];
  onDone: () => void;
}) {
  const [source, setSource] = useState<"supplier" | "shop" | null>(null);
  const [choosing, setChoosing] = useState(false);
  const done = () => {
    setSource(null);
    onDone();
  };
  return (
    <View style={styles.stack}>
      {!choosing && (
        <Button
          variant={source ? "outline" : undefined}
          onPress={() => setChoosing(true)}
          icon={<Ionicons name="add" size={18} color={source ? colors.primary : colors.primaryForeground} />}
        >
          {source ? "Change" : "Add"}
        </Button>
      )}
      {choosing && (
        <Card style={styles.card}>
          <Text style={styles.label}>Where is the stock coming from?</Text>
          <View style={styles.stack}>
            <Button
              variant="outline"
              onPress={() => {
                setSource("supplier");
                setChoosing(false);
              }}
              icon={<Ionicons name="car-outline" size={18} color={colors.primary} />}
            >
              From a supplier
            </Button>
            <Button
              variant="outline"
              onPress={() => {
                setSource("shop");
                setChoosing(false);
              }}
              icon={<Ionicons name="storefront-outline" size={18} color={colors.primary} />}
            >
              From another shop
            </Button>
            <Button variant="outline" onPress={() => setChoosing(false)}>
              Cancel
            </Button>
          </View>
        </Card>
      )}
      {source === "supplier" && <ReceiveForm locations={locations} items={items} conversions={conversions} onDone={done} />}
      {source === "shop" && <ShopReceiveForm siteId={siteId} shops={shops} items={items} conversions={conversions} onDone={done} />}
    </View>
  );
}

const SHOP_REBATE = "Rebate";
const SHOP_OWNER = "Owner";

/** Stock from another shop, a rebate, or the owner: goes into the main store and is never a paid
 * delivery. Whatever a shop gives beyond what it owes us is kept as stock we owe back. */
function ShopReceiveForm({
  siteId,
  shops,
  items,
  conversions,
  onDone,
}: {
  siteId: string;
  shops: { id: string; name: string }[];
  items: { id: string; name: string; unit: string }[];
  conversions: StockConversion[];
  onDone: () => void;
}) {
  const { state } = useSmartClean();
  const [sourceName, setSourceName] = useState("");
  const [note, setNote] = useState("");
  const [itemName, setItemName] = useState("");
  const [qty, setQty] = useState("");
  const [unitLabel, setUnitLabel] = useState("");

  const item = items.find((i) => i.name === itemName);
  const unitOptions = item
    ? [item.unit, ...conversions.filter((c) => c.itemId === item.id).map((c) => `${c.unit} of ${c.baseQty}`)]
    : [];
  const chosenUnit = unitOptions.includes(unitLabel) ? unitLabel : (unitOptions[0] ?? "");
  const unitName = chosenUnit === item?.unit ? "base" : chosenUnit.replace(/ of \d+$/, "");

  const submit = async () => {
    const shop = shops.find((s) => s.name === sourceName);
    if (!state.accessToken || !sourceName || !item || Number(qty) < 1) {
      appAlert("Missing details", "Choose the shop or source, the product and the quantity received.");
      return;
    }
    try {
      await receiveStockFromShop(state.accessToken, {
        siteId,
        source: sourceName === SHOP_REBATE ? "rebate" : sourceName === SHOP_OWNER ? "owner" : "shop",
        ...(shop ? { fromSiteId: shop.id } : {}),
        note: note.trim() || undefined,
        lines: [{ itemId: item.id, qty: Number(qty), unit: unitName }],
      });
      appAlert("Received", `${item.name} added to the main store.`, undefined, "success");
      setQty("");
      setItemName("");
      onDone();
    } catch (error) {
      appAlert("Could not receive", errorMessage(error));
    }
  };

  return (
    <View style={styles.stack}>
      <FormSection step={1} title="Where it came from">
        <Text style={styles.muted}>
          A shop returning stock we lent, or giving us extra, a rebate, or stock the owner brings in. It goes into the main store and is
          never a paid delivery.
        </Text>
        <SelectField label="Shop / source" value={sourceName} options={[...shops.map((s) => s.name), SHOP_REBATE, SHOP_OWNER]} onChange={setSourceName} />
        <View style={styles.field}>
          <Text style={styles.label}>Note (optional)</Text>
          <TextInput style={styles.input} value={note} onChangeText={setNote} placeholderTextColor={colors.mutedForeground} />
        </View>
      </FormSection>
      <FormSection step={2} title="What arrived">
        <SelectField label="Product" value={itemName} options={items.map((i) => i.name)} onChange={setItemName} />
        {unitOptions.length > 1 && <SelectField label="Counted in" value={chosenUnit} options={unitOptions} onChange={setUnitLabel} />}
        <QtyStepper label="Received" value={qty} onChange={setQty} />
      </FormSection>
      <Button onPress={submit} icon={<Ionicons name="download" size={18} color={colors.primaryForeground} />}>
        Confirm received
      </Button>
    </View>
  );
}

/** A delivery into the main store, one line at a time. Pack counts convert to
 * the base unit on the server. */
const QUALITY_ISSUES: { label: string; value?: StockQualityIssue }[] = [
  { label: "No quality issue" },
  { label: "Damaged", value: "damaged" },
  { label: "Expired", value: "expired" },
  { label: "Short dated", value: "short_dated" },
  { label: "Wrong quantity", value: "wrong_quantity" },
  { label: "Other issue", value: "other" },
];

function ReceiveForm({
  locations,
  items,
  conversions,
  onDone,
}: {
  locations: StockLocation[];
  items: { id: string; name: string; unit: string }[];
  conversions: StockConversion[];
  onDone: () => void;
}) {
  const { state } = useSmartClean();
  const stores = locations.filter((l) => l.type === "store");
  const [storeName, setStoreName] = useState("");
  const [suppliers, setSuppliers] = useState<StockSupplier[]>([]);
  const [supplierName, setSupplierName] = useState("");
  const [reference, setReference] = useState("");
  const [quality, setQuality] = useState("No quality issue");
  const [rejected, setRejected] = useState(false);
  const [itemName, setItemName] = useState("");
  const [qty, setQty] = useState("");
  const [ordered, setOrdered] = useState("");
  const [unitLabel, setUnitLabel] = useState("");

  useEffect(() => {
    if (!storeName && stores[0]) setStoreName(stores[0].name);
  }, [stores, storeName]);
  useEffect(() => {
    if (!state.accessToken) return;
    listStockSuppliers(state.accessToken)
      .then(setSuppliers)
      .catch(() => setSuppliers([]));
  }, [state.accessToken]);

  const store = stores.find((l) => l.name === storeName);
  const supplier = suppliers.find((s) => s.name === supplierName);
  const qualityIssue = QUALITY_ISSUES.find((q) => q.label === quality)?.value;
  const item = items.find((i) => i.name === itemName);
  // The item's own unit first, then every unit it can be received in ("case of 12").
  const unitOptions = item
    ? [item.unit, ...conversions.filter((c) => c.itemId === item.id).map((c) => `${c.unit} of ${c.baseQty}`)]
    : [];
  const chosenUnit = unitOptions.includes(unitLabel) ? unitLabel : (unitOptions[0] ?? "");
  const unitName = chosenUnit === item?.unit ? "base" : chosenUnit.replace(/ of \d+$/, "");

  const submit = async () => {
    if (!state.accessToken || !store || !item || !supplier || (!rejected && Number(qty) < 1)) {
      appAlert("Missing details", "Pick the supplier and the product, and add the quantity received.");
      return;
    }
    try {
      await receiveStockDelivery(state.accessToken, {
        locationId: store.id,
        supplierId: supplier.id,
        deliveryRef: reference.trim() || undefined,
        lines: [
          {
            itemId: item.id,
            qty: rejected ? 0 : Number(qty),
            unit: unitName,
            ...(ordered ? { ordered: Number(ordered) } : {}),
            ...(qualityIssue ? { quality: qualityIssue } : {}),
            ...(rejected ? { rejected: true } : {}),
          },
        ],
      });
      appAlert(rejected ? "Refused" : "Received", rejected ? `${item.name} was refused and nothing was booked in.` : `${item.name} added to ${store.name}.`, undefined, "success");
      setQty("");
      setOrdered("");
      setRejected(false);
      setQuality("No quality issue");
      onDone();
    } catch (error) {
      appAlert("Could not receive", errorMessage(error));
    }
  };

  return (
    <View style={styles.stack}>
      <FormSection step={1} title="The delivery">
        <SelectField label="Into store" value={storeName} options={stores.map((l) => l.name)} onChange={setStoreName} />
        <SelectField label="Supplier" value={supplierName} options={suppliers.map((s) => s.name)} onChange={setSupplierName} />
        {suppliers.length === 0 && <Text style={styles.muted}>No suppliers yet. A manager adds them on the web app.</Text>}
        <View style={styles.field}>
          <Text style={styles.label}>Invoice / reference (optional)</Text>
          <TextInput style={styles.input} value={reference} onChangeText={setReference} placeholderTextColor={colors.mutedForeground} />
        </View>
      </FormSection>
      <FormSection step={2} title="What arrived">
        <SelectField label="Product" value={itemName} options={items.map((i) => i.name)} onChange={setItemName} />
        {unitOptions.length > 1 && <SelectField label="Counted in" value={chosenUnit} options={unitOptions} onChange={setUnitLabel} />}
        <NumberField label="Expected (from the invoice)" value={ordered} onChange={setOrdered} />
        {!rejected && <QtyStepper label="Received" value={qty} onChange={setQty} />}
        {!rejected && <SelectField label="Quality" value={quality} options={QUALITY_ISSUES.map((q) => q.label)} onChange={setQuality} />}
        <View style={styles.rowBetween}>
          <Text style={styles.label}>Reject wrong product</Text>
          <Switch value={rejected} onValueChange={setRejected} />
        </View>
      </FormSection>
      <Button onPress={submit} icon={<Ionicons name="download" size={18} color={colors.primaryForeground} />}>
        Receive delivery
      </Button>
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    stack: { gap: spacing.md },
    card: { padding: spacing.lg },
    tabs: { gap: spacing.sm, paddingBottom: spacing.xs },
    tab: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      paddingHorizontal: spacing.lg,
      minHeight: 44,
      borderRadius: radius.round,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    tabSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
    tabText: { fontSize: typography.body, fontWeight: "600", color: colors.mutedForeground },
    tabTextSelected: { color: colors.primaryForeground },
    tabBadge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
    tabBadgeSelected: { backgroundColor: colors.primaryForeground },
    tabBadgeText: { fontSize: typography.small, fontWeight: "700", color: colors.primaryForeground },
    tabBadgeTextSelected: { color: colors.primary },
    modeHint: { fontSize: typography.body, color: colors.mutedForeground, marginTop: spacing.sm, marginBottom: spacing.md },
    statRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
    stat: { flex: 1, backgroundColor: colors.secondary, borderRadius: radius.xl, paddingVertical: spacing.md, alignItems: "center" },
    statValue: { fontSize: typography.title, fontWeight: "700", color: colors.foreground },
    statLabel: { fontSize: typography.small, color: colors.mutedForeground },
    sectionTitle: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
    countPill: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 7, alignItems: "center", justifyContent: "center", backgroundColor: colors.accent },
    countPillText: { fontSize: typography.small, fontWeight: "700", color: colors.primary },
    empty: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl, borderRadius: radius.xl, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border },
    section: { padding: spacing.lg, gap: spacing.md },
    sectionHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    sectionHeadText: { fontSize: typography.h2, fontWeight: "600", color: colors.foreground },
    stepDot: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.accent },
    stepDotText: { fontSize: typography.small, fontWeight: "700", color: colors.primary },
    segmented: { flexDirection: "row", backgroundColor: colors.muted, borderRadius: radius.xl, padding: 3 },
    segment: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.lg },
    segmentOn: { backgroundColor: colors.card },
    segmentText: { fontSize: typography.body, color: colors.mutedForeground, fontWeight: "500" },
    segmentTextOn: { color: colors.primary, fontWeight: "700" },
    stepperHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
    stepper: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    stepBtn: { width: 52, height: 52, borderRadius: radius.xl, alignItems: "center", justifyContent: "center", backgroundColor: colors.accent },
    stepInput: {
      flex: 1,
      height: 52,
      textAlign: "center",
      fontSize: 24,
      fontWeight: "700",
      color: colors.foreground,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.xl,
      backgroundColor: colors.card,
    },
    hintPill: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.round, backgroundColor: colors.successSoft },
    hintPillLow: { backgroundColor: colors.destructiveSoft },
    hintPillText: { fontSize: typography.small, fontWeight: "600", color: colors.success },
    hintPillTextLow: { color: colors.destructive },
    lowNote: { fontSize: typography.small, color: colors.destructive },
    modalBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-start", padding: spacing.xl, paddingTop: spacing.xxl * 2 },
    modalSheet: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
    modalInput: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.foreground, backgroundColor: colors.card, fontSize: 16, minHeight: 44 },
    modalButtons: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
    qtyBubble: { width: 56, height: 56, borderRadius: radius.xl, alignItems: "center", justifyContent: "center", backgroundColor: colors.accent },
    qtyBubbleInfo: { backgroundColor: colors.infoSoft },
    qtyBubbleValue: { fontSize: typography.h1, fontWeight: "700", color: colors.primary },
    qtyBubbleValueInfo: { color: colors.info },
    qtyBubbleUnit: { fontSize: typography.tiny, color: colors.primary, maxWidth: 52 },
    placeLine: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
    countDone: { borderColor: colors.success },
    heading: { fontSize: typography.h2, fontWeight: "600", color: colors.foreground },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
    rowText: { flex: 1 },
    countCard: { padding: spacing.lg, gap: spacing.xs },
    countRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    countInput: { flex: 1 },
    rowTitle: { fontSize: typography.body, color: colors.foreground, fontWeight: "600" },
    field: { gap: spacing.xs },
    label: { fontSize: typography.small, color: colors.mutedForeground },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.card,
      color: colors.foreground,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: 16,
    },
  }),
);
