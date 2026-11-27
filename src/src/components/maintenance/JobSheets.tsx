import { useEffect, useMemo, useState } from "react";
import { Linking, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PhotoCapture } from "@/components/PhotoCapture";
import { PickerRow, PickerSheet, type PickerItem } from "@/components/PickerSheet";
import { SelectField } from "@/components/SelectField";
import { appAlert } from "@/components/Dialog";
import {
  Chip,
  Field,
  FieldLabel,
  Hint,
  MoneyField,
  Panel,
  SheetFooter,
  tint,
} from "@/components/maintenance/JobKit";
import { readAmount } from "@/domain/maintenanceJobView";
import { formatMoney } from "@/domain/payroll";
import {
  addMaintenanceQuote,
  fileUrl,
  listMaintenanceContractors,
  type MaintenanceContractor,
  type MaintenanceFile,
  type MaintenanceJob,
  type MaintenanceQuote,
  type MaintenanceState,
} from "@/api/client";
import { colors, radius, spacing, themedStyles, typography, useThemeVersion } from "@/theme";

/**
 * One small, focused sheet per step of a job, the same as the PWA's. Each asks for only what that step needs, says why,
 * and puts the one button that does it at the bottom where a thumb is. `onSubmit` does the work and says whether it
 * worked; the sheet closes only then, so a failure leaves what was typed in place.
 */

/** A file for a step (a quotation, a proof of payment): photographed there and then, and uploaded straight away. */
function FileTile({
  token,
  label,
  done,
  onPicked,
}: {
  token: string;
  label: string;
  done?: string;
  onPicked: (file: MaintenanceFile) => void;
}) {
  useThemeVersion();
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.gap}>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen((v) => !v)}
        style={[styles.tile, done ? styles.tileDone : null]}
      >
        <View style={[styles.tileIcon, { backgroundColor: done ? tint(colors.success, 0.15) : tint(colors.primary, 0.1) }]}>
          <Ionicons
            name={done ? "checkmark-circle-outline" : "camera-outline"}
            size={20}
            color={done ? colors.success : colors.primary}
          />
        </View>
        <View style={styles.flex}>
          <Text style={styles.tileTitle}>{done ? "Attached" : label}</Text>
          <Text numberOfLines={1} style={styles.tileSub}>
            {done ? `${done} · tap to change` : "Take a photo"}
          </Text>
        </View>
      </Pressable>
      {open ? (
        <PhotoCapture
          token={token}
          files={[]}
          max={1}
          label={label}
          onChange={(next) => {
            if (next[0]) {
              onPicked({ filePath: next[0], fileName: label });
              setOpen(false);
            }
          }}
        />
      ) : null}
    </View>
  );
}

/** Asks "why?" in a sentence or two, with the common answers one tap away. */
export function ReasonSheet({
  title,
  intro,
  label,
  placeholder,
  presets = [],
  confirmLabel,
  destructive,
  onSubmit,
  onClose,
}: {
  title: string;
  intro: string;
  label: string;
  placeholder?: string;
  presets?: string[];
  confirmLabel: string;
  destructive?: boolean;
  onSubmit: (text: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const ok = text.trim().length >= 3;
  const submit = async () => {
    setBusy(true);
    const done = await onSubmit(text.trim());
    setBusy(false);
    if (done) onClose();
  };
  return (
    <Panel
      title={title}
      description={intro}
      onClose={onClose}
      footer={
        <SheetFooter
          onClose={onClose}
          onConfirm={() => void submit()}
          confirmLabel={confirmLabel}
          disabled={!ok}
          busy={busy}
          destructive={destructive}
        />
      }
    >
      {presets.length > 0 ? (
        <View style={styles.wrap}>
          {presets.map((p) => (
            <Chip key={p} on={text === p} onPress={() => setText(p)}>
              {p}
            </Chip>
          ))}
        </View>
      ) : null}
      <View style={styles.field}>
        <FieldLabel>{label}</FieldLabel>
        <Field multiline value={text} onChangeText={setText} placeholder={placeholder} autoFocus />
        {text.length > 0 && !ok ? <Hint>A few more words, please.</Hint> : null}
      </View>
    </Panel>
  );
}

/** For organisations that let people choose: pick any step to skip to, and say why. */
export function SkipToSheet({
  targets,
  onSubmit,
  onClose,
}: {
  targets: { to: MaintenanceState; label: string }[];
  onSubmit: (to: MaintenanceState, reason: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [to, setTo] = useState<MaintenanceState | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const ok = to !== null && text.trim().length >= 3;
  const submit = async () => {
    if (!to) return;
    setBusy(true);
    const done = await onSubmit(to, text.trim());
    setBusy(false);
    if (done) onClose();
  };
  return (
    <Panel
      title="Skip to another step"
      description="The usual checks are set aside. Your reason is kept on the record."
      onClose={onClose}
      fit
      footer={<SheetFooter onClose={onClose} onConfirm={() => void submit()} confirmLabel="Skip" disabled={!ok} busy={busy} />}
    >
      <View style={styles.field}>
        <Text style={styles.strong}>Skip to</Text>
        <View style={styles.wrap}>
          {targets.map((t) => (
            <Chip key={t.to} on={to === t.to} onPress={() => setTo(t.to)}>
              {t.label}
            </Chip>
          ))}
        </View>
      </View>
      <View style={styles.field}>
        <FieldLabel>Why is this being skipped?</FieldLabel>
        <Field
          multiline
          value={text}
          onChangeText={setText}
          placeholder="For example: the contractor fixed it on the spot, so no quote was needed"
        />
      </View>
    </Panel>
  );
}

const CLOSE_OUTCOMES: { to: MaintenanceState; label: string; hint: string }[] = [
  { to: "completed", label: "Done", hint: "The work was finished some other way." },
  { to: "no_action", label: "No repair needed", hint: "Nothing needed fixing." },
  { to: "cancelled", label: "Cancelled", hint: "The job is not going ahead." },
];

/** For people given the right: close a job before it is finished. Says how it ends and why; the reason is required. */
export function CloseEarlySheet({
  onSubmit,
  onClose,
}: {
  onSubmit: (to: MaintenanceState, reason: string) => Promise<boolean>;
  onClose: () => void;
}) {
  useThemeVersion();
  const [to, setTo] = useState<MaintenanceState | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const ok = to !== null && text.trim().length >= 3;
  const submit = async () => {
    if (!to) return;
    setBusy(true);
    const done = await onSubmit(to, text.trim());
    setBusy(false);
    if (done) onClose();
  };
  return (
    <Panel
      title="Close early"
      description="This closes the job before it is finished. Your reason is kept on the record."
      onClose={onClose}
      fit
      footer={
        <SheetFooter
          onClose={onClose}
          onConfirm={() => void submit()}
          confirmLabel="Close the job"
          disabled={!ok}
          busy={busy}
          destructive
        />
      }
    >
      <View style={styles.field}>
        <Text style={styles.strong}>How does it end?</Text>
        {CLOSE_OUTCOMES.map((o) => (
          <Pressable
            key={o.to}
            accessibilityRole="radio"
            accessibilityState={{ checked: to === o.to }}
            onPress={() => setTo(o.to)}
            style={[styles.option, to === o.to && styles.optionOn]}
          >
            <View style={styles.flex}>
              <Text style={styles.optionTitle}>{o.label}</Text>
              <Text style={styles.optionHint}>{o.hint}</Text>
            </View>
            {to === o.to ? <Ionicons name="checkmark" size={16} color={colors.primary} /> : null}
          </Pressable>
        ))}
      </View>
      <View style={styles.field}>
        <FieldLabel>Why is it being closed early?</FieldLabel>
        <Field multiline value={text} onChangeText={setText} placeholder="For example: the landlord dealt with it directly" />
        {text.length > 0 && text.trim().length < 3 ? <Hint>A few more words, please.</Hint> : null}
      </View>
    </Panel>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** When is the contractor coming: a day and a time, in two taps for the usual answers. */
export function BookVisitSheet({
  onSubmit,
  onClose,
}: {
  onSubmit: (iso: string) => Promise<boolean>;
  onClose: () => void;
}) {
  useThemeVersion();
  const today = new Date();
  const days = [0, 1, 2].map((n) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + n);
    return {
      key: dayKey(d),
      label: n === 0 ? "Today" : n === 1 ? "Tomorrow" : d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" }),
    };
  });
  const [date, setDate] = useState(days[1].key);
  const [time, setTime] = useState("09:00");
  const [busy, setBusy] = useState(false);
  const when = useMemo(() => new Date(`${date}T${time}`), [date, time]);
  const valid = !Number.isNaN(when.getTime()) && when.getTime() > Date.now();
  const submit = async () => {
    setBusy(true);
    const done = await onSubmit(when.toISOString());
    setBusy(false);
    if (done) onClose();
  };
  return (
    <Panel
      title="Book the contractor"
      description="Pick the day and time they said they would come."
      onClose={onClose}
      footer={
        <SheetFooter onClose={onClose} onConfirm={() => void submit()} confirmLabel="Book the visit" disabled={!valid} busy={busy} />
      }
    >
      <View style={styles.field}>
        <FieldLabel>Day</FieldLabel>
        <View style={styles.wrap}>
          {days.map((d) => (
            <Chip key={d.key} on={date === d.key} onPress={() => setDate(d.key)}>
              {d.label}
            </Chip>
          ))}
        </View>
        <Field
          accessibilityLabel="Another day"
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
          keyboardType="numbers-and-punctuation"
        />
      </View>
      <View style={styles.field}>
        <FieldLabel>Time</FieldLabel>
        <View style={styles.wrap}>
          {["08:00", "09:00", "10:00", "13:00", "14:00"].map((t) => (
            <Chip key={t} on={time === t} onPress={() => setTime(t)}>
              {t}
            </Chip>
          ))}
        </View>
        <Field
          accessibilityLabel="Another time"
          value={time}
          onChangeText={setTime}
          placeholder="HH:MM"
          autoCapitalize="none"
          keyboardType="numbers-and-punctuation"
        />
      </View>
      <View style={[styles.note, valid ? styles.noteGood : styles.noteBad]}>
        <Text style={[styles.noteText, { color: valid ? colors.primary : colors.destructive }, valid && { fontWeight: "500" }]}>
          {valid
            ? when.toLocaleString(undefined, {
                weekday: "long",
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })
            : "That time has already passed."}
        </Text>
      </View>
    </Panel>
  );
}

/** Close the job: the final cost, prefilled with what was approved. */
export function CloseSheet({
  approved,
  onSubmit,
  onClose,
}: {
  approved: number | null;
  onSubmit: (finalCost: number | undefined) => Promise<boolean>;
  onClose: () => void;
}) {
  const [text, setText] = useState(approved != null ? String(approved) : "");
  const [busy, setBusy] = useState(false);
  const blank = text.trim() === "";
  const value = blank ? undefined : readAmount(text);
  const valid = blank || value !== null;
  const submit = async () => {
    setBusy(true);
    const done = await onSubmit(value ?? undefined);
    setBusy(false);
    if (done) onClose();
  };
  return (
    <Panel
      title="Close the job"
      description="You checked the repair and it is good."
      onClose={onClose}
      footer={
        <SheetFooter onClose={onClose} onConfirm={() => void submit()} confirmLabel="Close the job" disabled={!valid} busy={busy} />
      }
    >
      <View style={styles.field}>
        <FieldLabel>What did it cost in the end?</FieldLabel>
        <MoneyField label="Final cost" value={text} onChangeText={setText} placeholder="0.00" />
        <Hint>
          {approved != null ? `Approved at ${formatMoney(approved)}. ` : ""}Leave it empty if there was no cost.
        </Hint>
        {!valid ? <Hint tone="bad">Enter the cost as a number, like 1250.50</Hint> : null}
      </View>
    </Panel>
  );
}

/** Proof that a payment was made: the picture, and how much it covered. */
export function ProofSheet({
  token,
  contractor,
  owing,
  onSubmit,
  onClose,
}: {
  token: string;
  contractor: string;
  owing: number;
  onSubmit: (file: MaintenanceFile, amount: number) => Promise<boolean>;
  onClose: () => void;
}) {
  const [file, setFile] = useState<MaintenanceFile | null>(null);
  const [amount, setAmount] = useState(String(owing));
  const [busy, setBusy] = useState(false);
  const value = readAmount(amount);
  const valid = !!file && !!value && value > 0 && value <= owing + 0.001;
  const submit = async () => {
    if (!file || !value) return;
    setBusy(true);
    const done = await onSubmit(file, value);
    setBusy(false);
    if (done) onClose();
  };
  return (
    <Panel
      title="Record the payment"
      description={`Payment to ${contractor}. Add the proof so it is on file.`}
      onClose={onClose}
      footer={
        <SheetFooter onClose={onClose} onConfirm={() => void submit()} confirmLabel="Save the proof" disabled={!valid} busy={busy} />
      }
    >
      <FileTile token={token} label="Add the proof of payment" done={file?.fileName} onPicked={setFile} />
      <View style={styles.field}>
        <FieldLabel>How much did it cover?</FieldLabel>
        <MoneyField label="Amount paid" value={amount} onChangeText={setAmount} />
        <Hint>Still owing: {formatMoney(owing)}</Hint>
        {value !== null && value > owing + 0.001 ? <Hint tone="bad">That is more than what is owing.</Hint> : null}
      </View>
      <View style={styles.softNote}>
        <Text style={styles.hint}>This records the proof. It counts as paid once you confirm it went through.</Text>
      </View>
    </Panel>
  );
}

type Decision = "approve" | "request_changes" | "reject";

/** Decide a quote: what it says at the top, three clear choices, and a reason where one is needed. */
export function ReviewQuoteSheet({
  quote,
  onDecide,
  onClose,
}: {
  quote: MaintenanceQuote;
  onDecide: (decision: Decision, comment: string) => Promise<boolean>;
  onClose: () => void;
}) {
  useThemeVersion();
  const [choice, setChoice] = useState<Decision>("approve");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const needsReason = choice !== "approve";
  const valid = !needsReason || comment.trim().length >= 3;
  const options: { value: Decision; label: string; hint: string; icon: keyof typeof Ionicons.glyphMap; tone: string }[] = [
    { value: "approve", label: "Approve", hint: "The work can go ahead", icon: "checkmark", tone: colors.success },
    { value: "request_changes", label: "Ask for changes", hint: "Send it back for a better quote", icon: "pencil", tone: colors.warning },
    { value: "reject", label: "Reject", hint: "Not going ahead with this one", icon: "close", tone: colors.destructive },
  ];
  const submit = async () => {
    setBusy(true);
    // A reason only goes with ask-for-changes or reject. One typed and then abandoned must not ride along with an approval.
    const done = await onDecide(choice, needsReason ? comment.trim() : "");
    setBusy(false);
    if (done) onClose();
  };
  return (
    <Panel
      title="Review the quote"
      description={`From ${quote.contractorName}`}
      onClose={onClose}
      footer={
        <SheetFooter
          onClose={onClose}
          onConfirm={() => void submit()}
          confirmLabel={
            choice === "approve" ? `Approve ${formatMoney(quote.amount)}` : choice === "reject" ? "Reject the quote" : "Send it back"
          }
          disabled={!valid}
          busy={busy}
          destructive={choice === "reject"}
        />
      }
    >
      <View style={styles.summary}>
        <Text style={styles.big}>{formatMoney(quote.amount)}</Text>
        <Text style={styles.hintBody}>
          {quote.depositAmount > 0 ? `${formatMoney(quote.depositAmount)} deposit asked for first` : "No deposit asked for"}
          {quote.reference ? ` · ref ${quote.reference}` : ""}
          {quote.revision > 1 ? ` · version ${quote.revision}` : ""}
        </Text>
        {quote.files.length > 0 ? (
          <View style={styles.wrap}>
            {quote.files.map((f) => (
              <Pressable
                key={f.filePath}
                accessibilityRole="link"
                onPress={() => {
                  const url = fileUrl(f.filePath);
                  if (url) void Linking.openURL(url);
                }}
                style={styles.fileChip}
              >
                <Text style={styles.fileChipText}>{f.fileName || "See the quotation"}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
      <View style={styles.field}>
        {options.map((o) => (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: choice === o.value }}
            onPress={() => setChoice(o.value)}
            style={[styles.choice, choice === o.value && styles.choiceOn]}
          >
            <View style={styles.choiceIcon}>
              <Ionicons name={o.icon} size={16} color={o.tone} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.optionTitle}>{o.label}</Text>
              <Text style={styles.optionHint}>{o.hint}</Text>
            </View>
            <View style={[styles.dot, choice === o.value && styles.dotOn]}>
              {choice === o.value ? <Ionicons name="checkmark" size={12} color={colors.primaryForeground} /> : null}
            </View>
          </Pressable>
        ))}
      </View>
      {needsReason ? (
        <View style={styles.field}>
          <FieldLabel>{choice === "reject" ? "Why not?" : "What should change?"}</FieldLabel>
          <Field multiline value={comment} onChangeText={setComment} placeholder="So the contractor knows what to fix" autoFocus />
        </View>
      ) : null}
    </Panel>
  );
}

/** Add a contractor's quote: who, how much, whether they want a deposit, and the quotation itself. */
export function QuoteSheet({
  token,
  jobId,
  revisable,
  onClose,
  onSaved,
}: {
  token: string;
  jobId: string;
  revisable: { id: string; contractorName: string; revision: number }[];
  onClose: () => void;
  onSaved: (job: MaintenanceJob) => void;
}) {
  useThemeVersion();
  const [contractors, setContractors] = useState<MaintenanceContractor[] | null>(null);
  const [contractorId, setContractorId] = useState("");
  const [picking, setPicking] = useState(false);
  const [amount, setAmount] = useState("");
  const [wantsDeposit, setWantsDeposit] = useState(false);
  const [deposit, setDeposit] = useState("");
  const [reference, setReference] = useState("");
  const [replaces, setReplaces] = useState("");
  const [file, setFile] = useState<MaintenanceFile | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listMaintenanceContractors(token)
      .then(setContractors)
      .catch((error) => {
        appAlert("Could not load contractors", error instanceof Error ? error.message : "Try again in a moment.");
        setContractors([]);
      });
  }, [token]);

  const items: PickerItem[] = useMemo(
    () =>
      (contractors ?? []).map((s) => ({
        key: s.id,
        label: s.name,
        sub: [s.preferred ? "Preferred" : null, s.categories.join(", ")].filter(Boolean).join(" · ") || undefined,
        icon: s.preferred ? "star" : undefined,
        group: s.preferred ? "Preferred" : "Contractors",
      })),
    [contractors],
  );
  const chosen = items.find((i) => i.key === contractorId) ?? null;
  const total = readAmount(amount);
  const depositValue = wantsDeposit ? readAmount(deposit) : 0;
  const depositBad =
    wantsDeposit && (depositValue === null || depositValue <= 0 || (total !== null && depositValue > total));
  const valid = !!chosen && !!file && !!total && total > 0 && !depositBad;
  const revisionOptions = revisable.map((q) => ({ id: q.id, label: `${q.contractorName}, version ${q.revision}` }));
  const NEW = "No, it is a new quote";

  const save = async () => {
    if (!chosen || !file || !total) return;
    setSaving(true);
    try {
      onSaved(
        await addMaintenanceQuote(token, jobId, {
          contractorId: chosen.key,
          reference: reference.trim() || undefined,
          amount: total,
          depositAmount: wantsDeposit ? (depositValue ?? 0) : 0,
          files: [file],
          supersedesId: replaces || undefined,
        }),
      );
    } catch (error) {
      appAlert("Could not add the quote", error instanceof Error ? error.message : "Try again in a moment.");
      setSaving(false);
    }
  };

  return (
    <>
      <Panel
        title="Add a quote"
        description="Enter what the contractor quoted. An approver decides next."
        onClose={onClose}
        footer={
          <SheetFooter onClose={onClose} onConfirm={() => void save()} confirmLabel="Send for approval" disabled={!valid} busy={saving} />
        }
      >
        <View style={styles.field}>
          <FieldLabel>Who is it from?</FieldLabel>
          {contractors !== null && contractors.length === 0 ? (
            <View style={styles.softNote}>
              <Text style={styles.hintBody}>No contractors are set up yet. Add them under Contractors, then come back.</Text>
            </View>
          ) : (
            <PickerRow
              label="Contractor"
              icon="star-outline"
              value={chosen?.label}
              sub={chosen?.sub}
              placeholder={contractors === null ? "Loading contractors…" : "Choose a contractor"}
              count={contractors ? `${contractors.length}` : undefined}
              disabled={contractors === null}
              onPress={() => setPicking(true)}
            />
          )}
        </View>

        {revisable.length > 0 ? (
          <SelectField
            label="Is this a new version of an earlier quote?"
            value={revisionOptions.find((o) => o.id === replaces)?.label ?? NEW}
            options={[NEW, ...revisionOptions.map((o) => o.label)]}
            onChange={(label) => setReplaces(revisionOptions.find((o) => o.label === label)?.id ?? "")}
          />
        ) : null}

        <View style={styles.field}>
          <FieldLabel>Quote total</FieldLabel>
          <MoneyField label="Quote total" value={amount} onChangeText={setAmount} placeholder="0.00" />
        </View>

        <View style={styles.depositBox}>
          <View style={styles.depositRow}>
            <View style={styles.flex}>
              <Text style={styles.optionTitle}>They want a deposit first</Text>
              <Text style={styles.optionHint}>The job will wait until it is paid.</Text>
            </View>
            <Switch
              value={wantsDeposit}
              onValueChange={setWantsDeposit}
              accessibilityLabel="They want a deposit first"
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          </View>
          {wantsDeposit ? (
            <View style={styles.field}>
              <FieldLabel>Deposit amount</FieldLabel>
              <MoneyField label="Deposit amount" value={deposit} onChangeText={setDeposit} />
              {depositBad && deposit.trim() !== "" ? <Hint tone="bad">The deposit cannot be more than the quote.</Hint> : null}
            </View>
          ) : null}
        </View>

        <View style={styles.field}>
          <FieldLabel>Their reference (optional)</FieldLabel>
          <Field value={reference} onChangeText={setReference} placeholder="Quote number from the contractor" />
        </View>

        <FileTile token={token} label="Attach the quotation" done={file?.fileName} onPicked={setFile} />
      </Panel>
      <PickerSheet
        visible={picking}
        title="Choose a contractor"
        searchPlaceholder="Search contractors"
        items={items}
        selected={contractorId}
        noun="contractors"
        emptyHint="Check the spelling."
        onPick={(key) => {
          setContractorId(key);
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
    </>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    flex: { flex: 1, minWidth: 0 },
    gap: { gap: spacing.sm },
    field: { gap: 6 },
    wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    strong: { fontSize: typography.body, fontWeight: "500", color: colors.foreground },
    hint: { fontSize: typography.small, color: colors.mutedForeground },
    hintBody: { fontSize: typography.body, color: colors.mutedForeground },
    tile: {
      minHeight: 72,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      borderRadius: 16,
      borderWidth: 2,
      borderStyle: "dashed",
      borderColor: colors.border,
      paddingHorizontal: spacing.lg,
    },
    tileDone: { borderColor: tint(colors.success, 0.5), backgroundColor: tint(colors.success, 0.05) },
    tileIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.round },
    tileTitle: { fontSize: typography.body, fontWeight: "600", color: colors.foreground },
    tileSub: { fontSize: typography.small, color: colors.mutedForeground },
    option: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    optionOn: { borderColor: colors.primary, backgroundColor: tint(colors.primary, 0.05) },
    optionTitle: { fontSize: typography.body, fontWeight: "600", color: colors.foreground },
    optionHint: { fontSize: typography.small, color: colors.mutedForeground },
    note: { borderRadius: 16, padding: spacing.md },
    noteGood: { backgroundColor: tint(colors.primary, 0.1) },
    noteBad: { backgroundColor: tint(colors.destructive, 0.1) },
    noteText: { fontSize: typography.body },
    softNote: { borderRadius: 16, backgroundColor: colors.muted, padding: spacing.md },
    summary: { gap: 4, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.muted, padding: spacing.lg },
    big: { fontSize: 30, fontWeight: "700", color: colors.foreground },
    fileChip: { borderRadius: radius.round, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 12, paddingVertical: 6 },
    fileChipText: { fontSize: typography.body, fontWeight: "500", color: colors.foreground },
    choice: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: "transparent",
      backgroundColor: colors.muted,
      padding: spacing.md,
    },
    choiceOn: { borderColor: colors.primary, backgroundColor: tint(colors.primary, 0.05) },
    choiceIcon: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: radius.round, backgroundColor: colors.card },
    dot: { width: 20, height: 20, alignItems: "center", justifyContent: "center", borderRadius: radius.round, borderWidth: 1, borderColor: colors.border },
    dotOn: { borderColor: colors.primary, backgroundColor: colors.primary },
    depositBox: { gap: spacing.md, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
    depositRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  }),
);
