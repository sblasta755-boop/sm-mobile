import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { SelectField } from "@/components/SelectField";
import { appAlert } from "@/components/Dialog";
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
  listStockTransfersInTransit,
  logStockWaste,
  receiveStockDelivery,
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
  type StockTransfer,
} from "@/types/smartclean";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

type Mode = "issue" | "waste" | "restock" | "receive" | "count";

const MODE_LABELS: Record<Mode, string> = {
  issue: "Issue",
  waste: "Waste",
  restock: "Restock",
  receive: "Receive",
  count: "Count",
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

  const sites = state.sites.filter((s) => currentUser?.siteIds.includes(s.id) || access.manage);
  const [siteId, setSiteId] = useState(sites[0]?.id ?? "");
  useEffect(() => {
    if (!siteId && sites[0]) setSiteId(sites[0].id);
  }, [sites, siteId]);

  const modes = useMemo<Mode[]>(
    () => [...(access.issue ? (["issue", "waste"] as Mode[]) : []), ...(access.keep ? (["restock", "receive", "count"] as Mode[]) : [])],
    [access.issue, access.keep],
  );
  const [mode, setMode] = useState<Mode>("issue");
  useEffect(() => {
    if (modes.length && !modes.includes(mode)) setMode(modes[0]);
  }, [modes, mode]);

  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [levels, setLevels] = useState<StockLevel[]>([]);
  const [restock, setRestock] = useState<StockRestockTask[]>([]);
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
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
    ])
      .then(([nextLocations, nextLevels, nextRestock, nextTransfers, nextConversions]) => {
        if (cancelled) return;
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
      <View style={styles.chips}>
        {modes.map((m) => (
          <Pressable
            key={m}
            accessibilityRole="button"
            accessibilityState={{ selected: mode === m }}
            onPress={() => setMode(m)}
            style={[styles.chip, mode === m && styles.chipSelected]}
          >
            <Text style={[styles.chipText, mode === m && styles.chipTextSelected]}>
              {MODE_LABELS[m]}
              {m === "restock" && restock.length > 0 ? ` (${restock.length})` : ""}
            </Text>
          </Pressable>
        ))}
      </View>

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
          <Text style={styles.heading}>Restock list</Text>
          {restock.length === 0 && <Text style={styles.muted}>Nothing to restock right now.</Text>}
          {restock.map((task) => (
            <Card key={task.id} style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{itemName(task.itemId)}</Text>
                <Text style={styles.muted}>
                  {locationName(task.locationId)} - bring {task.qty} {itemUnit(task.itemId)}
                </Text>
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
          <Text style={styles.heading}>In transit</Text>
          {transfers.length === 0 && <Text style={styles.muted}>No stock is on the way.</Text>}
          {transfers.map((transfer) => (
            <Card key={transfer.id} style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>
                  {transfer.qty} {itemUnit(transfer.itemId)} {itemName(transfer.itemId)}
                </Text>
                <Text style={styles.muted}>
                  {locationName(transfer.fromLocationId)} → {locationName(transfer.toLocationId)}
                </Text>
              </View>
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
            </Card>
          ))}
        </View>
      )}

      {mode === "count" && <CountView siteId={siteId} locations={locations} items={items} canApprove={access.manage} onDone={reload} />}

      {mode === "receive" && <ReceiveForm locations={locations} items={items} conversions={conversions} onDone={reload} />}
    </Screen>
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
  onDone,
}: {
  siteId: string;
  locations: StockLocation[];
  items: { id: string; name: string; unit: string }[];
  canApprove: boolean;
  onDone: () => void;
}) {
  const { state, currentUser } = useSmartClean();
  const outbox = useOutbox();
  const token = state.accessToken;
  const userId = currentUser?.id ?? "";
  const today = useMemo(() => new Date().toLocaleDateString("en-CA"), []);
  const [base, setBase] = useState<StockCountSession | null>(null);
  const [entries, setEntries] = useState<Record<string, string>>({});

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
  const fetchCount = useCallback(async (): Promise<boolean> => {
    if (!token) return false;
    try {
      keep(await startStockCount(token, siteId));
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
      if (cached) await fetchCount();
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
    return (
      <View style={styles.stack}>
        <Text style={styles.muted}>
          Start today's count to get the list of items most worth checking. You won't see what the system expects until you submit.
          Once it is on your phone you can count with no signal.
        </Text>
        <Button
          onPress={async () => {
            if (!(await fetchCount()) && state.connectivity === "offline") {
              appAlert("No connection", "Today's list is built on the server, so you need a connection to start the count. After that you can count offline.");
            }
          }}
        >
          Start today's count
        </Button>
      </View>
    );
  }

  const name = (id: string) => items.find((i) => i.id === id)?.name ?? id;
  const place = (id: string) => locations.find((l) => l.id === id)?.name ?? id;
  const open = count.status === "open" && !submitPending;
  const allCounted = count.lines.every((l) => l.counted != null);

  return (
    <View style={styles.stack}>
      <Text style={styles.heading}>
        {count.countDate} - {count.status === "open" ? (submitPending ? "submitted" : "counting") : count.status === "closed" ? "closed" : "resolving variances"}
      </Text>
      {waiting > 0 && (
        <Text style={styles.muted}>
          {submitPending
            ? "Count submitted on this phone - it will go to the server as soon as there is a connection."
            : "Saved on this phone - it will go to the server as soon as there is a connection."}
        </Text>
      )}
      {count.lines.map((line) => (
        <Card key={line.id} style={styles.countCard}>
          <Text style={styles.rowTitle}>{name(line.itemId)}</Text>
          <Text style={styles.muted}>{place(line.locationId)}</Text>
          {count.status === "open" ? (
            <View style={styles.countRow}>
              <TextInput
                style={[styles.input, styles.countInput]}
                keyboardType="number-pad"
                placeholder="Counted"
                placeholderTextColor={colors.mutedForeground}
                editable={open}
                value={entries[line.id] ?? (line.counted != null ? String(line.counted) : "")}
                onChangeText={(text) => setEntries({ ...entries, [line.id]: text.replace(/[^0-9]/g, "") })}
                onEndEditing={() => {
                  const value = entries[line.id];
                  if (value) void queue("stock.count.enter", { countId: count.id, lineId: line.id, counted: Number(value) });
                }}
              />
              {line.counted != null && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
            </View>
          ) : (
            <>
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
      {open && (
        <Button disabled={!allCounted} onPress={() => queue("stock.count.submit", { countId: count.id })}>
          Submit count
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
      appAlert("Missing details", "Pick the location, item and quantity.");
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

  return (
    <View style={styles.stack}>
      <SelectField label="From" value={locationName} options={choices.map((l) => l.name)} onChange={setLocationName} />
      <SelectField label="Item" value={itemName} options={items.map((i) => i.name)} onChange={setItemName} />
      <NumberField label={`Quantity${item ? ` (${onHand} ${item.unit} on hand)` : ""}`} value={qty} onChange={setQty} />
      {mode === "issue" ? (
        <>
          <SelectField
            label="For a"
            value={refType === "task" ? "Task" : refType === "round" ? "Round" : "Room"}
            options={["Task", "Round", "Room"]}
            onChange={(value) => {
              setRefType(value === "Task" ? "task" : value === "Round" ? "round" : "location");
              setRefName("");
            }}
          />
          <SelectField label={refType === "task" ? "Which task" : refType === "round" ? "Which round" : "Which room"} value={refName} options={refOptions} onChange={setRefName} />
        </>
      ) : (
        <SelectField label="Reason" value={reason} options={STOCK_WASTE_REASONS} onChange={setReason} />
      )}
      <Button onPress={submit} icon={<Ionicons name={mode === "issue" ? "arrow-up-circle" : "trash"} size={18} color={colors.primaryForeground} />}>
        {mode === "issue" ? "Issue" : "Log waste"}
      </Button>
    </View>
  );
}

/** A delivery into the main store, one line at a time. Pack counts convert to
 * the base unit on the server. */
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
  const [supplier, setSupplier] = useState("");
  const [reference, setReference] = useState("");
  const [itemName, setItemName] = useState("");
  const [qty, setQty] = useState("");
  const [ordered, setOrdered] = useState("");
  const [unitLabel, setUnitLabel] = useState("");

  useEffect(() => {
    if (!storeName && stores[0]) setStoreName(stores[0].name);
  }, [stores, storeName]);

  const store = stores.find((l) => l.name === storeName);
  const item = items.find((i) => i.name === itemName);
  // The item's own unit first, then every unit it can be received in ("case of 12").
  const unitOptions = item
    ? [item.unit, ...conversions.filter((c) => c.itemId === item.id).map((c) => `${c.unit} of ${c.baseQty}`)]
    : [];
  const chosenUnit = unitOptions.includes(unitLabel) ? unitLabel : (unitOptions[0] ?? "");
  const unitName = chosenUnit === item?.unit ? "base" : chosenUnit.replace(/ of \d+$/, "");

  const submit = async () => {
    if (!state.accessToken || !store || !item || !supplier.trim() || Number(qty) < 1) {
      appAlert("Missing details", "Add the supplier, the item and the quantity received.");
      return;
    }
    try {
      await receiveStockDelivery(state.accessToken, {
        locationId: store.id,
        supplier: supplier.trim(),
        deliveryRef: reference.trim() || undefined,
        lines: [{ itemId: item.id, qty: Number(qty), unit: unitName, ...(ordered ? { ordered: Number(ordered) } : {}) }],
      });
      appAlert("Received", `${item.name} added to ${store.name}.`, undefined, "success");
      setQty("");
      setOrdered("");
      onDone();
    } catch (error) {
      appAlert("Could not receive", errorMessage(error));
    }
  };

  return (
    <View style={styles.stack}>
      <SelectField label="Into store" value={storeName} options={stores.map((l) => l.name)} onChange={setStoreName} />
      <View style={styles.field}>
        <Text style={styles.label}>Supplier</Text>
        <TextInput style={styles.input} value={supplier} onChangeText={setSupplier} placeholderTextColor={colors.mutedForeground} />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Delivery reference</Text>
        <TextInput style={styles.input} value={reference} onChangeText={setReference} placeholderTextColor={colors.mutedForeground} />
      </View>
      <SelectField label="Item" value={itemName} options={items.map((i) => i.name)} onChange={setItemName} />
      {unitOptions.length > 1 && (
        <SelectField label="Counted in" value={chosenUnit} options={unitOptions} onChange={setUnitLabel} />
      )}
      <NumberField label="Received" value={qty} onChange={setQty} />
      <NumberField label="Ordered (if different)" value={ordered} onChange={setOrdered} />
      <Button onPress={submit}>Receive</Button>
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    stack: { gap: spacing.md },
    card: { padding: spacing.lg },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
    chip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: typography.small, color: colors.foreground },
    chipTextSelected: { color: colors.primaryForeground },
    heading: { fontSize: typography.h2, color: colors.foreground, marginTop: spacing.sm },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
    rowText: { flex: 1 },
    countCard: { padding: spacing.md, gap: spacing.xs },
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
