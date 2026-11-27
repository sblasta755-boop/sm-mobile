import { useCallback, useMemo, useRef, useState } from "react";
import { Image, Linking, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { ReminderSheet } from "@/components/ReminderSheet";
import {
  NextLine,
  Panel,
  PillButton,
  ProgressBar,
  Section,
  Tag,
  tint,
} from "@/components/maintenance/JobKit";
import {
  BookVisitSheet,
  CloseEarlySheet,
  CloseSheet,
  ProofSheet,
  QuoteSheet,
  ReasonSheet,
  ReviewQuoteSheet,
  SkipToSheet,
} from "@/components/maintenance/JobSheets";
import { MaintenancePill } from "@/components/MaintenancePill";
import { appAlert } from "@/components/Dialog";
import { formatMoney } from "@/domain/payroll";
import { useSmartClean } from "@/features/store";
import { describeEvent, firstName, friendlyTime } from "@/domain/maintenanceEvents";
import { PRIORITY_LABEL, remindState, statusText } from "@/domain/maintenanceReminders";
import { priorityColor, statusColor } from "@/domain/reminderColors";
import { maintenanceSeverityTone, nextStep } from "@/domain/maintenance";
import { invoiceNext, jobActions, nextStage, skipTargets, type JobActionId } from "@/domain/maintenanceJobView";
import {
  commentOnMaintenanceJob,
  decideMaintenanceQuote,
  fileUrl,
  forwardMaintenancePop,
  getMaintenanceJob,
  moveMaintenanceJob,
  recordMaintenancePop,
  respondMaintenanceReminder,
  sendMaintenanceReminder,
  verifyMaintenancePayment,
  type MaintenanceFile,
  type MaintenanceJob,
  type MaintenanceQuote,
  type MaintenanceState,
} from "@/api/client";
import { colors, radius, shadows, spacing, themedStyles, typography, useThemeVersion } from "@/theme";

type Glyph = keyof typeof Ionicons.glyphMap;

/** How each "More" action looks: an icon, a line saying what it does, and which group it sits in. */
const MORE_META: Partial<Record<JobActionId, { icon: Glyph; hint: string; group?: "permission" | "danger" }>> = {
  add_quote: { icon: "document-text-outline", hint: "Record a contractor's quote for approval." },
  start_repair: { icon: "construct-outline", hint: "Do the repair in-house." },
  redo: { icon: "refresh-outline", hint: "Send it back because it is not right yet." },
  contractor_refusing: { icon: "pause-circle-outline", hint: "Keep what the contractor said on the record." },
  skip_choose: {
    icon: "play-skip-forward-outline",
    hint: "Jump to a step of your choice without its usual checks. A reason is kept.",
    group: "permission",
  },
  skip_next: {
    icon: "play-skip-forward-outline",
    hint: "Move to the next step without its usual checks. A reason is kept.",
    group: "permission",
  },
  close_early: { icon: "close-circle-outline", hint: "Close it before it is finished. A reason is kept.", group: "permission" },
  no_repair: { icon: "checkmark-circle-outline", hint: "Close it without any work. Say what you found.", group: "danger" },
  cancel: { icon: "close-circle-outline", hint: "Close it for good. A short reason is kept.", group: "danger" },
};

const NO_RIGHTS = { report: true, handle: false, approve: false, pay: false };

const QUOTE_WORDS = (): Record<MaintenanceQuote["status"], { text: string; bg: string; fg: string }> => ({
  submitted: { text: "Waiting for approval", bg: tint(colors.warning, 0.2), fg: colors.warning },
  approved: { text: "Approved", bg: tint(colors.success, 0.15), fg: colors.success },
  rejected: { text: "Rejected", bg: tint(colors.destructive, 0.15), fg: colors.destructive },
  changes_requested: { text: "Changes asked for", bg: tint(colors.warning, 0.2), fg: colors.warning },
  superseded: { text: "Replaced by a newer version", bg: colors.muted, fg: colors.mutedForeground },
});

const EVENT_ICON: Record<string, Glyph> = {
  bell: "notifications-outline",
  photo: "image-outline",
  chat: "chatbubble-outline",
  check: "checkmark-circle-outline",
  pause: "pause-circle-outline",
  alert: "warning-outline",
  money: "wallet-outline",
  quote: "document-text-outline",
  dot: "ellipse-outline",
};

type Sheet =
  | { type: "quote" }
  | { type: "review"; quoteId: string }
  | { type: "visit" }
  | { type: "close" }
  | { type: "close_early" }
  | { type: "skip_choose" }
  | { type: "more" }
  | { type: "remind" }
  | { type: "proof"; invoiceId: string }
  | { type: "reason"; config: ReasonConfig };

type ReasonConfig = {
  title: string;
  intro: string;
  label: string;
  placeholder?: string;
  presets?: string[];
  confirmLabel: string;
  destructive?: boolean;
  run: (text: string) => Promise<boolean>;
};

const confirmDialog = (title: string, description: string, confirmLabel: string) =>
  new Promise<boolean>((resolve) =>
    appAlert(title, description, [
      { text: "Keep it", style: "cancel", onPress: () => resolve(false) },
      { text: confirmLabel, style: "destructive", onPress: () => resolve(true) },
    ]),
  );

const openFile = (filePath: string) => {
  const url = fileUrl(filePath);
  if (url) void Linking.openURL(url);
};

/** The whole of one maintenance job, the same as the PWA's job panel: what is needed next at the top, then what is wrong, the quotes, the money and the history. */
export default function MaintenanceJobScreen() {
  useThemeVersion();
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const { state } = useSmartClean();
  const token = state.accessToken;
  const [job, setJob] = useState<MaintenanceJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [note, setNote] = useState("");
  const [zoom, setZoom] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  const refresh = useCallback(async () => {
    if (!token || !jobId) return;
    try {
      setJob(await getMaintenanceJob(token, jobId));
    } catch (error) {
      appAlert("Could not open that job", error instanceof Error ? error.message : "Try again in a moment.");
    }
  }, [token, jobId]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  /** Does one thing, shows the job the server sends back, and says whether it worked. */
  const act = useCallback(
    async (run: () => Promise<unknown>, failure: string, success?: string): Promise<boolean> => {
      setBusy(true);
      try {
        const result = await run();
        if (result && typeof result === "object" && "state" in result && "events" in result) {
          setJob(result as MaintenanceJob);
        } else {
          await refresh();
        }
        if (success) say(success);
        return true;
      } catch (error) {
        appAlert(failure, error instanceof Error ? error.message : "Try again in a moment.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [refresh, say],
  );

  const caps = useMemo(() => job?.capabilities ?? NO_RIGHTS, [job]);
  const quotes = useMemo(() => job?.quotes ?? [], [job]);
  const invoices = job?.invoices ?? [];
  const holds = job?.holds ?? [];
  const actions = useMemo(() => (job ? jobActions(job, caps) : { primary: null, more: [] }), [job, caps]);
  const reviewable = quotes.filter((q) => q.status === "submitted");
  const remind = useMemo(
    () => (job?.reminders ? remindState(job.reminders) : { enabled: false, caption: "" }),
    [job],
  );

  if (!job || !token) {
    return (
      <Screen title="Maintenance">
        <View style={styles.skeletons}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.skeleton} />
          ))}
        </View>
      </Screen>
    );
  }

  const siteName = state.sites.find((s) => s.id === job.siteId)?.name ?? "Site";
  const place = job.locationId ? (state.locations.find((l) => l.id === job.locationId)?.name ?? null) : null;

  const move = (
    to: MaintenanceState,
    success: string,
    extra: { note?: string; finalCost?: number; visitAt?: string; override?: boolean } = {},
  ) => act(() => moveMaintenanceJob(token, job.id, to, extra), "That did not work", success);

  const reason = (config: ReasonConfig) => setSheet({ type: "reason", config });

  const run = async (id: JobActionId) => {
    setSheet(null);
    switch (id) {
      case "investigate":
        return void (await move("investigating", "You are looking into this"));
      case "add_quote":
        return setSheet({ type: "quote" });
      case "review_quote":
        return reviewable[0] ? setSheet({ type: "review", quoteId: reviewable[0].id }) : undefined;
      case "start_repair":
      case "work_started":
      case "start_again":
        return void (await move("in_progress", "Work has started"));
      case "book_visit":
        return setSheet({ type: "visit" });
      case "ready_to_check":
        return void (await move("awaiting_verification", "Ready to be checked"));
      case "close":
        return setSheet({ type: "close" });
      case "skip_next": {
        const next = nextStage(job.state, job.path);
        if (!next) return;
        return reason({
          title: `Skip to: ${next.label}`,
          intro: "The usual checks for this step are set aside. Your reason is kept on the record.",
          label: "Why is this step being skipped?",
          placeholder: "For example: the contractor fixed it on the spot, so no quote was needed",
          confirmLabel: "Skip",
          run: (text) => move(next.to, "Skipped. It is on the record with your reason.", { note: text, override: true }),
        });
      }
      case "skip_choose":
        return setSheet({ type: "skip_choose" });
      case "close_early":
        return setSheet({ type: "close_early" });
      case "redo":
        return reason({
          title: "Needs doing again",
          intro: "Say what is not right, so it can be put right.",
          label: "What needs doing again?",
          placeholder: "For example: it still leaks at the joint",
          confirmLabel: "Send it back",
          run: (text) => move("rework", "Sent back to be redone", { note: text }),
        });
      case "no_repair":
        return reason({
          title: "No repair needed",
          intro: "This closes the job without any work. Say what you found.",
          label: "What did you find?",
          presets: ["Already working again", "It was a false alarm", "Not something we repair"],
          confirmLabel: "Close it",
          run: (text) => move("no_action", "Closed, no repair needed", { note: text }),
        });
      case "cancel":
        if (!(await confirmDialog("Cancel this job?", "It will be closed and cannot be reopened.", "Cancel the job"))) return;
        return reason({
          title: "Cancel the job",
          intro: "A short reason is kept on the record.",
          label: "Why is it being cancelled?",
          presets: ["Reported by mistake", "Sorted another way", "Duplicate of another job"],
          confirmLabel: "Cancel the job",
          destructive: true,
          run: (text) => move("cancelled", "Job cancelled", { note: text }),
        });
      case "contractor_refusing":
        return reason({
          title: "Contractor is refusing or delaying",
          intro: "The job stays as it is. This keeps what they said on the record.",
          label: "What did the contractor say?",
          placeholder: "For example: they will not come until the old invoice is paid",
          confirmLabel: "Save it",
          run: (text) =>
            act(() => commentOnMaintenanceJob(token, job.id, text, "supplier_refused"), "Could not save that", "Saved"),
        });
    }
  };

  const step = nextStep(job, caps);
  const events = [...(job.events ?? [])].reverse();
  const shownEvents = showAll ? events : events.slice(0, 5);
  const activeHolds = holds.filter((h) => h.active);
  // A hold says it in detail ("Deposit of R 250 for Johnny's"); the generic lines would only repeat it.
  const GENERIC = ["Deposit not paid.", "Payment hold active."];
  const blockers = (job.path === "contractor" && job.state === "approved" && !job.clearedToProceed ? job.clearedBlockers : []).filter(
    (b) => !(activeHolds.length > 0 && GENERIC.includes(b)),
  );
  const reviewing = sheet?.type === "review" ? quotes.find((q) => q.id === sheet.quoteId) : undefined;
  const proofFor = sheet?.type === "proof" ? invoices.find((i) => i.id === sheet.invoiceId) : undefined;
  const words = QUOTE_WORDS();
  const sevLabel = job.severity[0].toUpperCase() + job.severity.slice(1);
  const origin = job.origin?.type === "task" && job.origin.id ? job.origin : null;
  const originTask = origin ? state.tasks.find((t) => t.id === origin.id) : undefined;
  const originItem = originTask?.checklist.find((c) => c.id === origin?.checklistItemId);
  const originText = origin
    ? originTask
      ? originItem
        ? `${originTask.title} (item: ${originItem.label})`
        : originTask.title
      : "(a task)"
    : "";

  return (
    <Screen title="Maintenance" overlay={toast ? <Text style={styles.toast}>{toast}</Text> : null}>
      <View style={styles.body}>
        {/* The job's name and where and when, as the PWA's panel heading. */}
        <View style={styles.head}>
          <Text style={styles.headTitle}>{job.title}</Text>
          <Text style={styles.headDesc}>
            {[siteName, place, `reported ${friendlyTime(job.createdAt).toLowerCase()}`].filter(Boolean).join(" · ")}
          </Text>
        </View>

        {/* A reminder waiting on this person, for the priorities that do not stop them with a pop-up. */}
        {(job.reminders?.waitingOnYou ?? []).map((r) => (
          <View key={r.id} style={[styles.card, { borderWidth: 2, borderColor: priorityColor(r.priority), gap: spacing.sm }]}>
            <View style={styles.row}>
              <Ionicons name="notifications-outline" size={16} color={colors.foreground} />
              <Text style={styles.cardTitle}>
                {firstName(r.senderName)} sent a {PRIORITY_LABEL[r.priority].toLowerCase()} reminder
              </Text>
            </View>
            {r.message ? <Text style={styles.muted}>{r.message}</Text> : null}
            <View style={styles.row}>
              <PillButton
                label="I have seen it"
                height={36}
                fullWidth={false}
                disabled={busy}
                onPress={() =>
                  void act(
                    () => respondMaintenanceReminder(token, r.id, { action: "acknowledge" }),
                    "Could not answer the reminder",
                    "Thanks, they can see you have it",
                  )
                }
              />
              <PillButton
                label="Ignore"
                variant="ghost"
                height={36}
                fullWidth={false}
                disabled={busy}
                onPress={() =>
                  reason({
                    title: "Ignore this reminder",
                    intro: `${firstName(r.senderName)} will see your reason in the job's activity.`,
                    label: "Why are you ignoring it?",
                    placeholder: "So the person who asked knows where it stands",
                    confirmLabel: "Ignore it",
                    destructive: true,
                    run: (text) =>
                      act(
                        () => respondMaintenanceReminder(token, r.id, { action: "ignore", reason: text }),
                        "Could not answer the reminder",
                        "Your reason has been sent",
                      ),
                  })
                }
              />
            </View>
          </View>
        ))}

        {/* 1. What is needed next, and the one button that does it. */}
        <View style={styles.card}>
          <NextLine step={step} large />
          <ProgressBar job={job} />
          {blockers.length > 0 || activeHolds.length > 0 ? (
            <View style={styles.blockers}>
              <Text style={styles.eyebrow}>WHAT IS STOPPING IT</Text>
              {[...blockers, ...activeHolds.map((h) => h.note || "Payment hold")].map((b, i) => (
                <View key={`${b}-${i}`} style={styles.blocker}>
                  <Ionicons name="pause-circle-outline" size={16} color={colors.destructive} style={{ marginTop: 2 }} />
                  <Text style={styles.blockerText}>{b}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {actions.primary ? (
            <PillButton label={actions.primary.label} disabled={busy} onPress={() => void run(actions.primary!.id)} />
          ) : null}
          {job.reminders ? (
            <View style={{ gap: 4 }}>
              <PillButton
                label="Remind"
                variant="outline"
                height={44}
                icon="notifications-outline"
                disabled={busy || !remind.enabled}
                onPress={() => setSheet({ type: "remind" })}
              />
              {remind.caption ? <Text style={styles.caption}>{remind.caption}</Text> : null}
            </View>
          ) : null}
          {actions.more.length > 0 ? (
            <Pressable accessibilityRole="button" onPress={() => setSheet({ type: "more" })} style={styles.moreLink}>
              <Text style={styles.moreText}>More actions</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>

        {/* 2. What is wrong. */}
        <Section
          title="What is wrong"
          summary={[sevLabel, job.evidence.length ? `${job.evidence.length} photo${job.evidence.length === 1 ? "" : "s"}` : null]
            .filter(Boolean)
            .join(" · ")}
        >
          <View style={styles.tags}>
            <MaintenancePill label={job.severity} tone={maintenanceSeverityTone(job.severity)} />
            <Tag text={job.path === "internal" ? "We fix it" : "A contractor fixes it"} bg={colors.muted} fg={colors.mutedForeground} />
            {job.assetLabel ? <Tag text={job.assetLabel} bg={colors.muted} fg={colors.mutedForeground} /> : null}
          </View>
          {origin ? (
            <Text style={[styles.small, { marginBottom: spacing.sm }]}>
              Raised from the task <Text style={styles.smallStrong}>{originText}</Text>
            </Text>
          ) : null}
          <Text style={[styles.description, !job.description && { color: colors.mutedForeground }]}>
            {job.description || "No more detail was given."}
          </Text>
          {job.evidence.length > 0 ? (
            <View style={styles.photos}>
              {job.evidence.map((photo, i) => (
                <Pressable
                  key={photo.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Open photo ${i + 1}`}
                  onPress={() => setZoom(photo.filePath)}
                  style={styles.photoWrap}
                >
                  <Image source={{ uri: fileUrl(photo.filePath) }} style={styles.photo} />
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={[styles.row, { marginTop: spacing.sm, gap: 6 }]}>
              <Ionicons name="image-outline" size={14} color={colors.mutedForeground} />
              <Text style={styles.small}>No photos</Text>
            </View>
          )}
        </Section>

        {/* 3. Quotes. */}
        {job.path === "contractor" && (caps.handle || caps.approve) ? (
          <Section
            title="Quotes"
            summary={
              quotes.length === 0
                ? "None yet"
                : `${quotes.length} quote${quotes.length === 1 ? "" : "s"}${quotes.some((q) => q.status === "submitted") ? " · one waiting" : ""}`
            }
            action={
              caps.handle && ["reported", "investigating", "awaiting_quote", "awaiting_approval"].includes(job.state) ? (
                <PillButton label="Add a quote" variant="outline" height={36} fullWidth={false} onPress={() => setSheet({ type: "quote" })} />
              ) : null
            }
          >
            {quotes.length === 0 ? (
              <View style={styles.softBox}>
                <Text style={styles.muted}>No quotes yet. Ask your contractor for one, then add it here for approval.</Text>
              </View>
            ) : (
              <View style={{ gap: spacing.sm }}>
                {quotes.map((q) => {
                  const w = words[q.status];
                  return (
                    <View key={q.id} style={[styles.item, q.status === "superseded" && { opacity: 0.6 }]}>
                      <View style={styles.itemTop}>
                        <View style={styles.flex}>
                          <Text numberOfLines={1} style={styles.itemName}>
                            {q.contractorName}
                          </Text>
                          <Text style={styles.itemAmount}>{formatMoney(q.amount)}</Text>
                        </View>
                        <Tag text={w.text} bg={w.bg} fg={w.fg} />
                      </View>
                      <Text style={styles.small}>
                        {q.depositAmount > 0 ? `${formatMoney(q.depositAmount)} deposit first` : "No deposit"}
                        {q.revision > 1 ? ` · version ${q.revision}` : ""}
                        {q.selfApproved ? " · approved by the person handling it" : ""}
                      </Text>
                      {q.decisionComment ? (
                        <View style={styles.comment}>
                          <Text style={styles.body14}>{q.decisionComment}</Text>
                        </View>
                      ) : null}
                      <View style={styles.itemLinks}>
                        {q.files.map((f) => (
                          <Pressable key={f.filePath} accessibilityRole="link" onPress={() => openFile(f.filePath)} style={styles.link}>
                            <Ionicons name="document-text-outline" size={14} color={colors.primary} />
                            <Text style={styles.linkText}>{f.fileName || "Quotation"}</Text>
                          </Pressable>
                        ))}
                        {q.status === "submitted" && caps.approve ? (
                          <View style={{ marginLeft: "auto" }}>
                            <PillButton
                              label="Review"
                              height={36}
                              fullWidth={false}
                              onPress={() => setSheet({ type: "review", quoteId: q.id })}
                            />
                          </View>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </Section>
        ) : null}

        {/* What it really cost, next to what was approved. */}
        {job.finalCost != null && (caps.handle || caps.approve || caps.pay) ? (
          <Section
            title="What it cost"
            summary={
              job.approvedAmount != null && job.finalCost !== job.approvedAmount
                ? `${formatMoney(job.finalCost)} · ${formatMoney(Math.abs(job.finalCost - job.approvedAmount))} ${job.finalCost > job.approvedAmount ? "over" : "under"}`
                : formatMoney(job.finalCost)
            }
          >
            <View style={{ gap: 6 }}>
              {job.approvedAmount != null ? (
                <View style={styles.costRow}>
                  <Text style={styles.muted}>Approved</Text>
                  <Text style={styles.body14}>{formatMoney(job.approvedAmount)}</Text>
                </View>
              ) : null}
              <View style={styles.costRow}>
                <Text style={styles.strong14}>Final cost</Text>
                <Text style={styles.costBig}>{formatMoney(job.finalCost)}</Text>
              </View>
              {job.approvedAmount != null && job.finalCost !== job.approvedAmount ? (
                <View
                  style={[
                    styles.costRow,
                    styles.costDiff,
                    { backgroundColor: tint(job.finalCost > job.approvedAmount ? colors.destructive : colors.success, 0.1) },
                  ]}
                >
                  <Text style={[styles.strong14, { color: job.finalCost > job.approvedAmount ? colors.destructive : colors.success }]}>
                    {job.finalCost > job.approvedAmount ? "Over the approved cost" : "Under the approved cost"}
                  </Text>
                  <Text style={[styles.strong14, { color: job.finalCost > job.approvedAmount ? colors.destructive : colors.success }]}>
                    {job.finalCost > job.approvedAmount ? "+" : "-"}
                    {formatMoney(Math.abs(job.finalCost - job.approvedAmount))}
                  </Text>
                </View>
              ) : null}
              {invoices.length > 0 ? (
                <>
                  <View style={styles.costRow}>
                    <Text style={styles.muted}>Paid so far</Text>
                    <Text style={styles.body14}>{formatMoney(invoices.reduce((n, i) => n + i.paidAmount, 0))}</Text>
                  </View>
                  <View style={styles.costRow}>
                    <Text style={styles.strong14}>Still to pay</Text>
                    <Text style={styles.strong14}>{formatMoney(invoices.reduce((n, i) => n + i.balance, 0))}</Text>
                  </View>
                </>
              ) : null}
            </View>
          </Section>
        ) : null}

        {/* 4. The money: only when there is some. */}
        {(invoices.length > 0 || holds.length > 0) && (caps.handle || caps.pay) ? (
          <Section
            title="Payments"
            summary={`${invoices.length} item${invoices.length === 1 ? "" : "s"}${activeHolds.length ? " · on hold" : ""}`}
          >
            <View style={{ gap: spacing.sm }}>
              {invoices.map((inv) => {
                const next = invoiceNext(inv, caps);
                const paid = inv.state === "paid";
                return (
                  <View key={inv.id} style={styles.item}>
                    <View style={styles.itemTop}>
                      <View style={styles.flex}>
                        <View style={[styles.row, { gap: 6 }]}>
                          <Ionicons
                            name={inv.kind === "deposit" ? "wallet-outline" : "receipt-outline"}
                            size={16}
                            color={colors.mutedForeground}
                          />
                          <Text style={[styles.itemName, styles.flex]}>
                            {inv.kind === "deposit" ? "Deposit" : `Invoice ${inv.number ?? ""}`.trim()} · {inv.contractorName}
                          </Text>
                        </View>
                        <Text style={styles.itemAmount}>{formatMoney(inv.amount)}</Text>
                        {inv.paidAmount > 0 && inv.balance > 0 ? (
                          <Text style={styles.small}>{formatMoney(inv.balance)} still owing</Text>
                        ) : null}
                      </View>
                      <Tag
                        text={
                          paid ? "Paid" : inv.state === "unpaid" ? "Not paid" : inv.state === "part_paid" ? "Part paid" : "Checking"
                        }
                        bg={paid ? tint(colors.success, 0.15) : tint(colors.warning, 0.2)}
                        fg={paid ? colors.success : colors.warning}
                      />
                    </View>
                    <Text style={styles.muted}>{next.text}</Text>
                    {inv.popFiles.length > 0 ? (
                      <View style={styles.itemLinks}>
                        {inv.popFiles.map((f) => (
                          <Pressable key={f.filePath} accessibilityRole="link" onPress={() => openFile(f.filePath)} style={styles.link}>
                            <Ionicons name="document-text-outline" size={14} color={colors.primary} />
                            <Text style={styles.linkText}>
                              Proof of payment{f.amount ? ` · ${formatMoney(f.amount)}` : ""}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                    {next.action && next.label ? (
                      <PillButton
                        label={next.label}
                        height={44}
                        variant={next.action === "verify" ? "primary" : "outline"}
                        disabled={busy}
                        onPress={() => {
                          if (next.action === "record_proof") setSheet({ type: "proof", invoiceId: inv.id });
                          else if (next.action === "verify")
                            void act(() => verifyMaintenancePayment(token, inv.id), "Could not confirm the payment", "Payment confirmed");
                          else
                            void act(
                              () => forwardMaintenancePop(token, inv.id, next.action === "acknowledged"),
                              "Could not save that",
                              "Saved",
                            );
                        }}
                      />
                    ) : null}
                  </View>
                );
              })}
              {holds.some((h) => !h.active) ? (
                <Text style={styles.small}>{holds.filter((h) => !h.active).length} earlier hold(s) lifted.</Text>
              ) : null}
              {activeHolds.length > 0 ? (
                <Text style={styles.small}>
                  A hold lifts by itself once the payment is confirmed and the contractor has the proof of payment.
                </Text>
              ) : null}
            </View>
          </Section>
        ) : null}

        {/* 5. What has happened, newest first, in words. */}
        <Section
          title="Activity"
          summary={
            events.length
              ? `${events.length} update${events.length === 1 ? "" : "s"} · latest: ${describeEvent(events[0]).text}`
              : "Nothing yet"
          }
        >
          <View style={{ gap: spacing.md }}>
            {shownEvents.map((event) => {
              const look = describeEvent(event);
              const batch = (event.data as { batchId?: string } | undefined)?.batchId;
              const sent =
                event.kind === "reminder_sent" ? (job.reminders?.history ?? []).filter((r) => r.batchId === batch) : [];
              return (
                <View key={event.id} style={styles.event}>
                  <View style={styles.eventIcon}>
                    <Ionicons name={EVENT_ICON[look.icon] ?? "ellipse-outline"} size={16} color={colors.mutedForeground} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.eventText}>{look.text}</Text>
                    {event.message && look.icon !== "photo" ? (
                      <Text numberOfLines={3} style={styles.muted}>
                        {event.message}
                      </Text>
                    ) : null}
                    {sent.length > 0 ? (
                      <View style={styles.tags}>
                        {sent.map((r) => (
                          <View
                            key={r.id}
                            style={[styles.statusChip, { borderColor: tint(statusColor(r.status), 0.5), backgroundColor: tint(statusColor(r.status), 0.1) }]}
                          >
                            <View style={[styles.statusDot, { backgroundColor: priorityColor(r.priority) }]} />
                            <Text numberOfLines={1} style={[styles.statusText, { color: statusColor(r.status) }]}>
                              {firstName(r.recipientName)}: {statusText(r.status, r.responseNote)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    <Text style={styles.small}>
                      {firstName(event.actorName)} · {friendlyTime(event.createdAt)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
          {events.length > 5 ? (
            <Pressable accessibilityRole="button" onPress={() => setShowAll((v) => !v)} style={styles.showAll}>
              <Text style={styles.showAllText}>{showAll ? "Show less" : `Show all ${events.length}`}</Text>
            </Pressable>
          ) : null}
          <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
            <TextInput
              value={note}
              onChangeText={setNote}
              multiline
              placeholder="Write a note for the team"
              placeholderTextColor={colors.mutedForeground}
              accessibilityLabel="Add a note"
              style={styles.noteInput}
            />
            <PillButton
              label="Add note"
              height={44}
              icon="send-outline"
              disabled={busy || !note.trim()}
              onPress={() => {
                const text = note.trim();
                if (!text) return;
                setNote("");
                void act(() => commentOnMaintenanceJob(token, job.id, text), "Could not add the note");
              }}
            />
          </View>
        </Section>
      </View>

      {/* The step sheets. Each opens above the job and closes back to it. */}
      {sheet?.type === "more" ? (
        <Panel title="More actions" description="Other things you can do with this job." onClose={() => setSheet(null)} fit>
          <View style={{ gap: spacing.xl, paddingBottom: spacing.sm }}>
            {(
              [
                [null, actions.more.filter((a) => !MORE_META[a.id]?.group)],
                ["Needs your permission", actions.more.filter((a) => MORE_META[a.id]?.group === "permission")],
                ["Close the job", actions.more.filter((a) => MORE_META[a.id]?.group === "danger")],
              ] as const
            )
              .filter(([, list]) => list.length > 0)
              .map(([heading, list]) => (
                <View key={heading ?? "main"} style={{ gap: spacing.sm }}>
                  {heading ? <Text style={[styles.eyebrow, { paddingHorizontal: 4 }]}>{heading.toUpperCase()}</Text> : null}
                  {list.map((a) => {
                    const meta = MORE_META[a.id];
                    const danger = meta?.group === "danger";
                    return (
                      <Pressable
                        key={a.id}
                        accessibilityRole="button"
                        accessibilityLabel={a.label}
                        onPress={() => void run(a.id)}
                        style={({ pressed }) => [styles.moreRow, pressed && { opacity: 0.85 }]}
                      >
                        <View style={[styles.moreIcon, { backgroundColor: tint(danger ? colors.destructive : colors.primary, 0.1) }]}>
                          <Ionicons name={meta?.icon ?? "chevron-forward"} size={20} color={danger ? colors.destructive : colors.primary} />
                        </View>
                        <View style={styles.flex}>
                          <Text style={[styles.moreLabel, danger && { color: colors.destructive }]}>{a.label}</Text>
                          {meta?.hint ? <Text style={styles.small}>{meta.hint}</Text> : null}
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
                      </Pressable>
                    );
                  })}
                </View>
              ))}
          </View>
        </Panel>
      ) : null}
      {sheet?.type === "remind" && job.reminders ? (
        <ReminderSheet
          reminders={job.reminders}
          jobTitle={job.title}
          onClose={() => setSheet(null)}
          onSubmit={(input) =>
            act(() => sendMaintenanceReminder(token, job.id, input), "Could not send the reminder", "Reminder sent")
          }
        />
      ) : null}
      {sheet?.type === "quote" ? (
        <QuoteSheet
          token={token}
          jobId={job.id}
          revisable={quotes.filter((q) => q.status === "changes_requested" || q.status === "rejected")}
          onClose={() => setSheet(null)}
          onSaved={(updated) => {
            setSheet(null);
            setJob(updated);
            say("Quote sent for approval");
          }}
        />
      ) : null}
      {reviewing ? (
        <ReviewQuoteSheet
          quote={reviewing}
          onClose={() => setSheet(null)}
          onDecide={(decision, comment) =>
            act(
              () => decideMaintenanceQuote(token, job.id, reviewing.id, decision, comment),
              "Could not record your decision",
              decision === "approve" ? "Quote approved" : decision === "reject" ? "Quote rejected" : "Sent back for changes",
            )
          }
        />
      ) : null}
      {sheet?.type === "visit" ? (
        <BookVisitSheet
          onClose={() => setSheet(null)}
          onSubmit={(iso) => move("scheduled", "Contractor booked", { visitAt: iso })}
        />
      ) : null}
      {sheet?.type === "close" ? (
        <CloseSheet
          approved={job.approvedAmount}
          onClose={() => setSheet(null)}
          onSubmit={(cost) => move("completed", "Job closed", { finalCost: cost })}
        />
      ) : null}
      {proofFor ? (
        <ProofSheet
          token={token}
          contractor={proofFor.contractorName}
          owing={proofFor.balance}
          onClose={() => setSheet(null)}
          onSubmit={(file: MaintenanceFile, amount: number) =>
            act(
              () => recordMaintenancePop(token, proofFor.id, [file], amount),
              "Could not save the proof",
              "Proof saved. Confirm it once it has gone through.",
            )
          }
        />
      ) : null}
      {sheet?.type === "skip_choose" ? (
        <SkipToSheet
          targets={skipTargets(job.state, job.path)}
          onClose={() => setSheet(null)}
          onSubmit={(to, text) => move(to, "Skipped. It is on the record with your reason.", { note: text, override: true })}
        />
      ) : null}
      {sheet?.type === "close_early" ? (
        <CloseEarlySheet
          onClose={() => setSheet(null)}
          onSubmit={(to, text) => move(to, "Closed. It is on the record with your reason.", { note: text, override: true })}
        />
      ) : null}
      {sheet?.type === "reason" ? (
        <ReasonSheet
          title={sheet.config.title}
          intro={sheet.config.intro}
          label={sheet.config.label}
          placeholder={sheet.config.placeholder}
          presets={sheet.config.presets}
          confirmLabel={sheet.config.confirmLabel}
          destructive={sheet.config.destructive}
          onSubmit={sheet.config.run}
          onClose={() => setSheet(null)}
        />
      ) : null}

      <Modal visible={zoom !== null} transparent animationType="fade" onRequestClose={() => setZoom(null)} statusBarTranslucent>
        <Pressable style={styles.zoomBackdrop} onPress={() => setZoom(null)} accessibilityLabel="Close photo">
          {zoom ? <Image source={{ uri: fileUrl(zoom) }} resizeMode="contain" style={styles.zoomImage} accessibilityLabel="Photo, full size" /> : null}
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    flex: { flex: 1, minWidth: 0 },
    row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    body: { gap: spacing.lg, paddingBottom: spacing.xl },
    skeletons: { gap: spacing.md },
    skeleton: { height: 112, borderRadius: 24, backgroundColor: colors.muted },
    head: { gap: 4 },
    headTitle: { fontSize: 18, fontWeight: "600", lineHeight: 22, color: colors.foreground },
    headDesc: { fontSize: typography.body, color: colors.mutedForeground },
    card: {
      gap: spacing.md,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: spacing.lg,
      ...shadows.card,
    },
    cardTitle: { flex: 1, fontSize: typography.body, fontWeight: "600", color: colors.foreground },
    muted: { fontSize: typography.body, color: colors.mutedForeground },
    small: { fontSize: typography.small, color: colors.mutedForeground },
    smallStrong: { fontWeight: "500", color: colors.foreground },
    body14: { fontSize: typography.body, color: colors.foreground },
    strong14: { fontSize: typography.body, fontWeight: "600", color: colors.foreground },
    caption: { textAlign: "center", fontSize: typography.small, color: colors.mutedForeground },
    eyebrow: { fontSize: typography.small, fontWeight: "600", letterSpacing: 0.5, color: colors.mutedForeground },
    blockers: { gap: 6, borderRadius: 16, backgroundColor: tint(colors.destructive, 0.05), padding: spacing.md },
    blocker: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
    blockerText: { flex: 1, fontSize: typography.body, color: colors.foreground },
    moreLink: { alignSelf: "center", minHeight: 40, flexDirection: "row", alignItems: "center", gap: 4 },
    moreText: { fontSize: typography.body, fontWeight: "500", color: colors.mutedForeground },
    tags: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
    description: { fontSize: 15, lineHeight: 24, color: colors.foreground },
    photos: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
    photoWrap: { width: "31.5%", aspectRatio: 1, overflow: "hidden", borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.muted },
    photo: { width: "100%", height: "100%" },
    softBox: { borderRadius: 16, backgroundColor: tint(colors.muted, 0.4), padding: spacing.lg },
    item: { gap: 4, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
    itemTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md },
    itemName: { fontSize: typography.body, fontWeight: "600", color: colors.foreground },
    itemAmount: { fontSize: 20, fontWeight: "700", color: colors.foreground },
    itemLinks: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm, marginTop: 4 },
    comment: { borderRadius: 12, backgroundColor: tint(colors.muted, 0.5), padding: spacing.sm },
    link: { flexDirection: "row", alignItems: "center", gap: 4 },
    linkText: { fontSize: typography.body, fontWeight: "500", color: colors.primary },
    costRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md },
    costBig: { fontSize: 18, fontWeight: "700", color: colors.foreground },
    costDiff: { borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: 4 },
    event: { flexDirection: "row", gap: spacing.md },
    eventIcon: { width: 32, height: 32, marginTop: 2, alignItems: "center", justifyContent: "center", borderRadius: radius.round, backgroundColor: colors.muted },
    eventText: { fontSize: typography.body, fontWeight: "500", color: colors.foreground },
    statusChip: { maxWidth: "100%", flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.round, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
    statusDot: { width: 8, height: 8, borderRadius: 4 },
    statusText: { flexShrink: 1, fontSize: typography.small, fontWeight: "500" },
    showAll: { minHeight: 40, justifyContent: "center", marginTop: spacing.md },
    showAllText: { fontSize: typography.body, fontWeight: "500", color: colors.primary },
    noteInput: {
      minHeight: 112,
      borderWidth: 1,
      borderColor: colors.input,
      borderRadius: 16,
      backgroundColor: colors.card,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      fontSize: 16,
      color: colors.foreground,
      textAlignVertical: "top",
    },
    moreRow: {
      minHeight: 64,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      paddingHorizontal: 14,
      paddingVertical: 10,
      ...shadows.card,
    },
    moreIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 12 },
    moreLabel: { fontSize: 16, fontWeight: "600", color: colors.foreground },
    zoomBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.9)", padding: spacing.sm },
    zoomImage: { width: "100%", height: "85%" },
    toast: {
      overflow: "hidden",
      borderRadius: radius.md,
      backgroundColor: colors.foreground,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      fontSize: typography.body,
      fontWeight: "500",
      color: colors.background,
    },
  }),
);
