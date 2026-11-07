import { useCallback, useState } from "react";
import { Image, Linking, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { SelectField } from "@/components/SelectField";
import { PhotoCapture } from "@/components/PhotoCapture";
import { MaintenancePill } from "@/components/MaintenancePill";
import { TextPrompt } from "@/components/TextPrompt";
import { appAlert } from "@/components/Dialog";
import { useSmartClean } from "@/features/store";
import {
  MAINTENANCE_STATE_LABEL,
  formatRand,
  maintenanceSeverityTone,
  maintenanceStateTone,
  parseAmount,
  parseLocalDateTime,
} from "@/domain/maintenance";
import {
  addMaintenanceQuote,
  commentOnMaintenanceJob,
  decideMaintenanceQuote,
  fileUrl,
  forwardMaintenancePop,
  getMaintenanceJob,
  listMaintenanceSuppliers,
  moveMaintenanceJob,
  recordMaintenancePop,
  verifyMaintenancePayment,
  type MaintenanceJob,
  type MaintenanceState,
  type MaintenanceSupplier,
} from "@/api/client";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

// A question put to the person before an action goes ahead: a reason, an amount.
type Ask = {
  title: string;
  label?: string;
  multiline?: boolean;
  numeric?: boolean;
  required?: boolean;
  confirmLabel?: string;
  initialValue?: string;
  then: (text: string) => Promise<unknown>;
};

const openFile = (filePath: string) => {
  const url = fileUrl(filePath);
  if (url) void Linking.openURL(url);
};

const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString() : "-");

export default function MaintenanceJobScreen() {
  useThemeVersion();
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const { state } = useSmartClean();
  const token = state.accessToken;
  const [job, setJob] = useState<MaintenanceJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [note, setNote] = useState("");
  const [visit, setVisit] = useState("");
  const [quoting, setQuoting] = useState(false);
  const [popFor, setPopFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !jobId) return;
    try {
      setJob(await getMaintenanceJob(token, jobId));
    } catch (error) {
      appAlert("Could not open that job", error instanceof Error ? error.message : "Try again in a moment.");
    }
  }, [token, jobId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  /** Runs one action and shows the job it returns, or says why it failed. */
  async function act(run: () => Promise<unknown>, failure: string) {
    setBusy(true);
    try {
      const result = await run();
      if (result && typeof result === "object" && "state" in result && "events" in result) setJob(result as MaintenanceJob);
      else await load();
    } catch (error) {
      appAlert(failure, error instanceof Error ? error.message : "Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  if (!job || !token) {
    return (
      <Screen title="Maintenance">
        <Text style={styles.muted}>Loading…</Text>
      </Screen>
    );
  }

  const caps = job.capabilities ?? { report: true, handle: false, approve: false, pay: false };
  const site = state.sites.find((s) => s.id === job.siteId);
  const quotes = job.quotes ?? [];
  const invoices = job.invoices ?? [];
  const holds = job.holds ?? [];

  const move = (to: MaintenanceState, label: string, reason?: string) => ({
    label,
    onPress: () => {
      if (reason) {
        setAsk({
          title: label,
          label: reason,
          multiline: true,
          then: (text) => act(() => moveMaintenanceJob(token, job.id, to, { note: text }), `Could not ${label.toLowerCase()}`),
        });
      } else {
        void act(() => moveMaintenanceJob(token, job.id, to), `Could not ${label.toLowerCase()}`);
      }
    },
  });

  // What the handler can do next. Quote and approval moves happen through quotes, not buttons here.
  const moves: { label: string; onPress: () => void }[] = [];
  if (caps.handle) {
    const early = ["reported", "investigating"].includes(job.state);
    if (job.state === "reported") moves.push(move("investigating", "Start investigating"));
    if (early && job.path === "contractor") moves.push(move("awaiting_quote", "Ask for quotes"));
    if (early && job.path === "internal") moves.push(move("in_progress", "Start the repair"));
    if (early) moves.push(move("no_action", "No repair needed", "What did you find?"));
    if (job.state === "scheduled") moves.push(move("in_progress", "Work has started"));
    if (job.state === "rework") moves.push(move("in_progress", "Start again"));
    if (job.state === "in_progress") moves.push(move("awaiting_verification", "Ready to check"));
    if (job.state === "awaiting_verification") {
      moves.push({
        label: "Repair is good: close",
        onPress: () =>
          setAsk({
            title: "Close the job",
            label: "Final cost (leave blank if none)",
            numeric: true,
            required: false,
            confirmLabel: "Close job",
            then: async (text) => {
              const cost = text === "" ? undefined : parseAmount(text);
              if (text !== "" && cost === null) {
                appAlert("Check the cost", "Enter the cost as a number.");
                return;
              }
              await act(() => moveMaintenanceJob(token, job.id, "completed", { finalCost: cost ?? undefined }), "Could not close the job");
            },
          }),
      });
      moves.push(move("rework", "Needs doing again", "What needs doing again?"));
    }
    if (!["completed", "no_action", "rejected", "cancelled", "awaiting_verification"].includes(job.state)) {
      moves.push({
        label: "Cancel job",
        onPress: () =>
          appAlert("Cancel this job?", undefined, [
            { text: "Keep it", style: "cancel" },
            {
              text: "Cancel job",
              style: "destructive",
              onPress: () =>
                setAsk({
                  title: "Cancel job",
                  label: "Why?",
                  multiline: true,
                  then: (text) => act(() => moveMaintenanceJob(token, job.id, "cancelled", { note: text }), "Could not cancel the job"),
                }),
            },
          ]),
      });
    }
  }

  function bookVisit() {
    const when = parseLocalDateTime(visit);
    if (!when) {
      appAlert("Check the date", "Type it like 2026-11-12 09:30.");
      return;
    }
    void act(() => moveMaintenanceJob(token as string, job!.id, "scheduled", { visitAt: when.toISOString() }), "Could not book the visit");
  }

  return (
    <Screen title="Maintenance job">
      <View style={styles.body}>
        <Card style={styles.gap}>
          <Text style={styles.title}>{job.title}</Text>
          <Text style={styles.muted}>
            {site?.name ?? "Site"}
            {job.assetLabel ? ` · ${job.assetLabel}` : ""} · {fmt(job.createdAt)}
          </Text>
          <View style={styles.pills}>
            <MaintenancePill label={job.severity} tone={maintenanceSeverityTone(job.severity)} />
            <MaintenancePill label={MAINTENANCE_STATE_LABEL[job.state]} tone={maintenanceStateTone(job.state)} />
            <MaintenancePill label={job.path === "internal" ? "In-house" : "Contractor"} tone="muted" />
            {job.path === "contractor" && (
              <MaintenancePill label={job.clearedToProceed ? "Cleared to proceed" : "Not cleared"} tone={job.clearedToProceed ? "success" : "warning"} />
            )}
          </View>
          {job.path === "contractor" && !job.clearedToProceed && job.clearedBlockers.length > 0 && (
            <Text style={styles.muted}>{job.clearedBlockers.join(" ")}</Text>
          )}
          {job.description ? <Text style={styles.text}>{job.description}</Text> : null}
          {job.visitAt ? <Text style={styles.text}>Contractor comes: {fmt(job.visitAt)}</Text> : null}
          {job.evidence.length > 0 && (
            <View style={styles.photos}>
              {job.evidence.map((photo) => (
                <Pressable key={photo.id} onPress={() => openFile(photo.filePath)}>
                  <Image source={{ uri: fileUrl(photo.filePath) }} style={styles.photo} />
                </Pressable>
              ))}
            </View>
          )}
        </Card>

        {caps.handle && job.state === "approved" && (
          <Card style={styles.gap}>
            <Text style={styles.heading}>Book the contractor</Text>
            <TextInput
              value={visit}
              onChangeText={setVisit}
              placeholder="2026-11-12 09:30"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              style={styles.input}
            />
            <Button disabled={busy || !visit.trim()} onPress={bookVisit}>
              Book the visit
            </Button>
          </Card>
        )}

        {moves.length > 0 && (
          <View style={styles.gap}>
            {moves.map((m) => (
              <Button key={m.label} variant="outline" disabled={busy} onPress={m.onPress}>
                {m.label}
              </Button>
            ))}
          </View>
        )}

        {holds.length > 0 && (
          <Card style={styles.gap}>
            <Text style={styles.heading}>Payment holds</Text>
            {holds.map((hold) => (
              <View key={hold.id}>
                <Text style={styles.text}>{hold.note || hold.reason.replace("_", " ")}</Text>
                <Text style={styles.muted}>
                  {hold.active ? "Active" : `Released ${fmt(hold.releasedAt)}${hold.override ? " (early, overridden)" : ""}`}
                </Text>
              </View>
            ))}
            {holds.some((h) => h.active) && (
              <Text style={styles.muted}>
                A hold clears by itself once the payment is confirmed and the proof of payment has been sent to the supplier.
              </Text>
            )}
          </Card>
        )}

        {(caps.handle || caps.approve) && job.path === "contractor" && (
          <Card style={styles.gap}>
            <Text style={styles.heading}>Quotes</Text>
            {quotes.length === 0 && <Text style={styles.muted}>No quotes yet.</Text>}
            {quotes.map((quote) => (
              <View key={quote.id} style={styles.sub}>
                <Text style={styles.text}>
                  {quote.supplierName} · {formatRand(quote.amount)}
                  {quote.depositAmount > 0 ? ` (deposit ${formatRand(quote.depositAmount)})` : ""}
                </Text>
                <MaintenancePill
                  label={`v${quote.revision} ${quote.status.replace("_", " ")}`}
                  tone={quote.status === "approved" ? "success" : quote.status === "submitted" ? "warning" : "muted"}
                />
                {quote.files.map((file) => (
                  <Pressable key={file.filePath} onPress={() => openFile(file.filePath)}>
                    <Text style={styles.link}>{file.fileName || "View quotation"}</Text>
                  </Pressable>
                ))}
                {quote.decisionComment ? <Text style={styles.muted}>{quote.decisionComment}</Text> : null}
                {quote.selfApproved ? <Text style={styles.warn}>Self-approved</Text> : null}
                {quote.status === "submitted" && caps.approve && (
                  <View style={styles.gap}>
                    <Button disabled={busy} onPress={() => void act(() => decideMaintenanceQuote(token, job.id, quote.id, "approve"), "Could not approve the quote")}>
                      {`Approve ${formatRand(quote.amount)}`}
                    </Button>
                    {(["request_changes", "reject"] as const).map((decision) => (
                      <Button
                        key={decision}
                        variant="outline"
                        disabled={busy}
                        onPress={() =>
                          setAsk({
                            title: decision === "reject" ? "Reject this quote" : "Ask for changes",
                            label: "Why?",
                            multiline: true,
                            then: (text) => act(() => decideMaintenanceQuote(token, job.id, quote.id, decision, text), "Could not record that"),
                          })
                        }
                      >
                        {decision === "reject" ? "Reject" : "Ask for changes"}
                      </Button>
                    ))}
                  </View>
                )}
              </View>
            ))}
            {caps.handle && ["reported", "investigating", "awaiting_quote", "awaiting_approval"].includes(job.state) && !quoting && (
              <Button variant="outline" onPress={() => setQuoting(true)}>
                Add a quote
              </Button>
            )}
            {quoting && (
              <QuoteForm
                token={token}
                jobId={job.id}
                revisable={quotes.filter((q) => q.status === "changes_requested" || q.status === "rejected")}
                onClose={() => setQuoting(false)}
                onSaved={(updated) => {
                  setQuoting(false);
                  setJob(updated);
                }}
              />
            )}
          </Card>
        )}

        {invoices.length > 0 && (
          <Card style={styles.gap}>
            <Text style={styles.heading}>Deposits and invoices</Text>
            {invoices.map((invoice) => (
              <View key={invoice.id} style={styles.sub}>
                <Text style={styles.text}>
                  {invoice.kind === "deposit" ? "Deposit" : `Invoice ${invoice.number ?? ""}`} · {invoice.supplierName} · {formatRand(invoice.amount)}
                  {invoice.balance > 0 && invoice.paidAmount > 0 ? ` (${formatRand(invoice.balance)} owing)` : ""}
                </Text>
                <MaintenancePill
                  label={invoice.state.replace("_", " ")}
                  tone={invoice.state === "paid" ? "success" : invoice.state === "unpaid" ? "warning" : "info"}
                />
                {invoice.popFiles.map((file) => (
                  <Pressable key={file.filePath} onPress={() => openFile(file.filePath)}>
                    <Text style={styles.link}>Proof of payment{file.amount ? ` (${formatRand(file.amount)})` : ""}</Text>
                  </Pressable>
                ))}
                {invoice.popForwardedAt ? <Text style={styles.muted}>Sent to the supplier</Text> : null}
                {invoice.supplierAckAt ? <Text style={styles.muted}>Supplier acknowledged</Text> : null}
                <View style={styles.gap}>
                  {caps.pay && invoice.state !== "paid" && invoice.state !== "pop_recorded" && popFor !== invoice.id && (
                    <Button variant="outline" onPress={() => setPopFor(invoice.id)}>
                      Record proof of payment
                    </Button>
                  )}
                  {popFor === invoice.id && (
                    <PopForm
                      token={token}
                      invoiceId={invoice.id}
                      owing={invoice.balance}
                      onClose={() => setPopFor(null)}
                      onSaved={() => {
                        setPopFor(null);
                        void load();
                      }}
                    />
                  )}
                  {caps.pay && invoice.state === "pop_recorded" && (
                    <Button disabled={busy} onPress={() => void act(() => verifyMaintenancePayment(token, invoice.id), "Could not confirm the payment")}>
                      Confirm payment went through
                    </Button>
                  )}
                  {(caps.handle || caps.pay) && invoice.popFiles.length > 0 && !invoice.popForwardedAt && (
                    <Button variant="outline" disabled={busy} onPress={() => void act(() => forwardMaintenancePop(token, invoice.id), "Could not record that")}>
                      I sent the proof to the supplier
                    </Button>
                  )}
                  {(caps.handle || caps.pay) && invoice.popForwardedAt && !invoice.supplierAckAt && (
                    <Button variant="outline" disabled={busy} onPress={() => void act(() => forwardMaintenancePop(token, invoice.id, true), "Could not record that")}>
                      Supplier got it
                    </Button>
                  )}
                </View>
              </View>
            ))}
          </Card>
        )}

        <Card style={styles.gap}>
          <Text style={styles.heading}>History</Text>
          {(job.events ?? []).map((event) => (
            <Text key={event.id} style={styles.text}>
              <Text style={styles.muted}>{fmt(event.createdAt)}  </Text>
              <Text style={styles.bold}>{event.actorName ?? "System"} </Text>
              {event.kind.replace(/_/g, " ")}
              {event.message ? ` - ${event.message}` : ""}
            </Text>
          ))}
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Add a note"
            placeholderTextColor={colors.mutedForeground}
            style={styles.input}
          />
          <Button
            variant="outline"
            disabled={busy || !note.trim()}
            onPress={() => {
              const text = note;
              setNote("");
              void act(() => commentOnMaintenanceJob(token, job.id, text), "Could not add the note");
            }}
          >
            Add note
          </Button>
          {caps.handle && job.state !== "completed" && (
            <Button
              variant="ghost"
              disabled={busy}
              onPress={() =>
                setAsk({
                  title: "Supplier will not come",
                  label: "What did the supplier say?",
                  multiline: true,
                  then: (text) => act(() => commentOnMaintenanceJob(token, job.id, text, "supplier_refused"), "Could not record that"),
                })
              }
            >
              Supplier is refusing or delaying
            </Button>
          )}
        </Card>
      </View>

      <TextPrompt
        visible={ask !== null}
        title={ask?.title ?? ""}
        label={ask?.label}
        multiline={ask?.multiline}
        numeric={ask?.numeric}
        required={ask?.required ?? true}
        confirmLabel={ask?.confirmLabel}
        initialValue={ask?.initialValue}
        onCancel={() => setAsk(null)}
        onSubmit={(text) => {
          const pending = ask;
          setAsk(null);
          if (pending) void pending.then(text);
        }}
      />
    </Screen>
  );
}

function QuoteForm({
  token,
  jobId,
  revisable,
  onClose,
  onSaved,
}: {
  token: string;
  jobId: string;
  revisable: { id: string; supplierName: string; revision: number }[];
  onClose: () => void;
  onSaved: (job: MaintenanceJob) => void;
}) {
  const [suppliers, setSuppliers] = useState<MaintenanceSupplier[] | null>(null);
  const [supplier, setSupplier] = useState("");
  const [replaces, setReplaces] = useState("A new quote");
  const [amount, setAmount] = useState("");
  const [deposit, setDeposit] = useState("");
  const [reference, setReference] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      listMaintenanceSuppliers(token)
        .then(setSuppliers)
        .catch((error) => appAlert("Could not load suppliers", error instanceof Error ? error.message : "Try again."));
    }, [token]),
  );

  const chosen = suppliers?.find((s) => s.name === supplier);
  const amountValue = parseAmount(amount);
  const depositValue = deposit.trim() === "" ? 0 : parseAmount(deposit);
  const revisionLabels = revisable.map((q) => `${q.supplierName} v${q.revision}`);
  const valid = !!chosen && !!amountValue && depositValue !== null && depositValue <= amountValue && photos.length > 0;

  async function save() {
    if (!chosen || !amountValue || depositValue === null) return;
    setSaving(true);
    try {
      const old = revisable.find((q) => `${q.supplierName} v${q.revision}` === replaces);
      onSaved(
        await addMaintenanceQuote(token, jobId, {
          supplierId: chosen.id,
          reference: reference.trim() || undefined,
          amount: amountValue,
          depositAmount: depositValue,
          files: photos.map((filePath) => ({ filePath, fileName: "Quotation photo" })),
          supersedesId: old?.id,
        }),
      );
    } catch (error) {
      appAlert("Could not add the quote", error instanceof Error ? error.message : "Try again.");
      setSaving(false);
    }
  }

  return (
    <View style={styles.gap}>
      <Text style={styles.heading}>Add a quote</Text>
      {suppliers === null ? (
        <Text style={styles.muted}>Loading suppliers…</Text>
      ) : suppliers.length === 0 ? (
        <Text style={styles.muted}>No suppliers are set up yet. A manager adds them on the web console.</Text>
      ) : (
        <SelectField label="Supplier" value={supplier || "Choose a supplier"} options={suppliers.map((s) => s.name)} onChange={setSupplier} />
      )}
      {revisionLabels.length > 0 && (
        <SelectField label="Replaces" value={replaces} options={["A new quote", ...revisionLabels]} onChange={setReplaces} />
      )}
      <TextInput value={amount} onChangeText={setAmount} placeholder="Quote amount" keyboardType="decimal-pad" placeholderTextColor={colors.mutedForeground} style={styles.input} />
      <TextInput value={deposit} onChangeText={setDeposit} placeholder="Deposit asked for (if any)" keyboardType="decimal-pad" placeholderTextColor={colors.mutedForeground} style={styles.input} />
      <TextInput value={reference} onChangeText={setReference} placeholder="Their reference (optional)" placeholderTextColor={colors.mutedForeground} style={styles.input} />
      <Text style={styles.muted}>Photograph the supplier&apos;s quotation.</Text>
      <PhotoCapture token={token} files={photos} onChange={setPhotos} label="Photograph the quotation" max={4} />
      {depositValue !== null && amountValue && depositValue > amountValue ? <Text style={styles.warn}>The deposit cannot be more than the quote.</Text> : null}
      <Button disabled={!valid || saving} loading={saving} onPress={save}>
        Send for approval
      </Button>
      <Button variant="outline" onPress={onClose}>
        Cancel
      </Button>
    </View>
  );
}

function PopForm({
  token,
  invoiceId,
  owing,
  onClose,
  onSaved,
}: {
  token: string;
  invoiceId: string;
  owing: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [amount, setAmount] = useState(String(owing));
  const [saving, setSaving] = useState(false);
  const value = parseAmount(amount);

  async function save() {
    if (!value) return;
    setSaving(true);
    try {
      await recordMaintenancePop(token, invoiceId, photos.map((filePath) => ({ filePath, fileName: "Proof of payment" })), value);
      appAlert("Proof recorded", "Confirm the payment once it has gone through.");
      onSaved();
    } catch (error) {
      appAlert("Could not record the proof", error instanceof Error ? error.message : "Try again.");
      setSaving(false);
    }
  }

  return (
    <View style={styles.gap}>
      <Text style={styles.muted}>Photograph the proof of payment and say how much it covers.</Text>
      <PhotoCapture token={token} files={photos} onChange={setPhotos} label="Photograph the proof" max={3} />
      <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="Amount paid" placeholderTextColor={colors.mutedForeground} style={styles.input} />
      <Button disabled={!value || photos.length === 0 || saving} loading={saving} onPress={save}>
        Record
      </Button>
      <Button variant="outline" onPress={onClose}>
        Cancel
      </Button>
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    body: { gap: spacing.md },
    gap: { gap: spacing.sm },
    sub: { gap: spacing.xs, paddingBottom: spacing.sm },
    title: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    heading: { fontSize: typography.small, fontWeight: "700", color: colors.foreground },
    text: { fontSize: typography.small, color: colors.foreground },
    bold: { fontWeight: "700" },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    warn: { fontSize: typography.small, color: colors.destructive },
    link: { fontSize: typography.small, color: colors.primary, textDecorationLine: "underline" },
    pills: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
    photos: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    photo: { width: 72, height: 72, borderRadius: radius.md },
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
  }),
);
