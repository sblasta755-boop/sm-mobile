import { useEffect, useMemo, useState } from "react";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { appAlert } from "@/components/Dialog";
import { NoticeContent } from "@/components/NoticeContent";
import {
  createNotice,
  getNotice,
  updateNotice,
  uploadImage,
  type Notice,
  type NoticeInput,
  type NoticeReminder,
} from "@/api/client";
import { dateKey } from "@/domain/schedule";
import {
  NOTICE_CATEGORIES,
  REMINDER_OPTIONS,
  WEEKDAYS,
  audienceCount,
  audienceText,
  emptyNotice,
  noticeProblem,
  toInput,
  weekdayOf,
  whenTextOf,
} from "@/domain/noticeboard";
import { useCanPostNotices, useNoticeboardOn } from "@/features/noticeboard";
import { useHomePath, useRoleLabel } from "@/features/roles";
import { useSmartClean } from "@/features/store";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

const FIXED_ROLES = ["cleaner", "waiter", "supervisor", "site_manager"];
const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

function Chip({ on, onPress, children, color, icon }: { on: boolean; onPress: () => void; children: string; color?: string; icon?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={[styles.chip, on && (color ? { borderColor: color, backgroundColor: `${color}22` } : styles.chipOn)]}
    >
      <View style={styles.chipInner}>
        {!!icon && <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={15} color={on ? (color ?? colors.primaryForeground) : colors.mutedForeground} />}
        <Text style={[styles.chipText, on && (color ? { color } : styles.chipTextOn)]}>{children}</Text>
      </View>
    </Pressable>
  );
}

function Row({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.rowBetween}>
      <View style={{ flex: 1 }}>
        <Text style={styles.value}>{label}</Text>
        {!!hint && <Text style={styles.muted}>{hint}</Text>}
      </View>
      <Switch accessibilityLabel={label} value={value} onValueChange={onChange} trackColor={{ true: colors.primary }} />
    </View>
  );
}

/** Post a new notice, or change one (?edit=ID). ?date= and ?people= pre-fill it from a day on the Schedule. */
export default function NoticeNewScreen() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const params = useLocalSearchParams<{ edit?: string; date?: string; people?: string }>();
  const { state, currentUser } = useSmartClean();
  const on = useNoticeboardOn();
  const canPost = useCanPostNotices();
  const homePath = useHomePath();
  const roleLabel = useRoleLabel();
  const token = state.accessToken;
  const isAdmin = currentUser?.role === "org_admin" || currentUser?.role === "operations_manager";
  const today = dateKey(new Date());

  const [editing, setEditing] = useState<Notice | null>(null);
  const [n, setN] = useState<NoticeInput>(() => {
    const base = emptyNotice(params.date);
    const people = params.people?.split(",").filter(Boolean) ?? [];
    return people.length ? { ...base, audience: { ...base.audience, userIds: people } } : base;
  });
  const [dated, setDated] = useState(!!params.date);
  const [multiDay, setMultiDay] = useState(false);
  const [notifyChange, setNotifyChange] = useState(false);
  const [filter, setFilter] = useState("");
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<"post" | "draft">("post");
  const [uploading, setUploading] = useState(false);
  const set = (patch: Partial<NoticeInput>) => setN((cur) => ({ ...cur, ...patch }));
  const setAudience = (patch: Partial<NoticeInput["audience"]>) => setN((cur) => ({ ...cur, audience: { ...cur.audience, ...patch } }));

  useEffect(() => {
    if (!params.edit || !token) return;
    getNotice(token, params.edit)
      .then((existing) => {
        setEditing(existing);
        setN(toInput(existing));
        setDated(!!existing.startDate);
        setMultiDay(!!existing.endDate);
      })
      .catch(() => appAlert("Could not open that notice", "It may have been removed.", [{ text: "OK", onPress: () => router.back() }]));
  }, [params.edit, token]);

  const mySites = useMemo(
    () => (isAdmin ? state.sites : state.sites.filter((s) => currentUser?.siteIds?.includes(s.id))).filter((s) => s.active),
    [state.sites, currentUser?.siteIds, isAdmin],
  );
  const roleKeys = useMemo(() => {
    const keys = [...FIXED_ROLES, ...state.staffRoles.map((r) => r.key)];
    return keys.filter((k, i) => keys.indexOf(k) === i && (isAdmin || k !== "site_manager"));
  }, [state.staffRoles, isAdmin]);
  const people = useMemo(() => {
    const mine = new Set(mySites.map((s) => s.id));
    return state.users.filter((u) => u.id !== currentUser?.id && (isAdmin || u.siteIds.some((s) => mine.has(s))));
  }, [state.users, mySites, currentUser?.id, isAdmin]);
  const shownPeople = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return people.filter((p) => !q || p.name.toLowerCase().includes(q)).slice(0, 30);
  }, [people, filter]);

  if (!on || !canPost) return <Redirect href={homePath as never} />;

  const published = editing?.status === "published";
  const reach = audienceCount(n.audience, people, currentUser?.id);
  const problem = noticeProblem(n, today);
  const repeat = !!n.recurrence;
  // What will actually be saved: the day settings only count while "for a specific day" is on.
  const effective: NoticeInput = {
    ...n,
    startDate: dated ? n.startDate : null,
    endDate: dated && multiDay && !repeat ? n.endDate : null,
    startTime: dated ? n.startTime : null,
    endTime: dated ? n.endTime : null,
    recurrence: dated ? n.recurrence : null,
  };
  const audienceChosen = !!(n.audience.all || n.audience.siteIds.length || n.audience.roles.length || n.audience.userIds.length);

  const attach = async () => {
    if (!token) return;
    if (n.attachments.length >= 5) return appAlert("At most 5 attachments");
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return appAlert("Photos not allowed", "Allow photo access in your phone settings to attach a picture.");
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (result.canceled) return;
    setUploading(true);
    try {
      const asset = result.assets[0];
      const name = asset.fileName ?? `notice-${Date.now()}.jpg`;
      const url = await uploadImage(token, asset.uri, name, asset.mimeType ?? "image/jpeg");
      set({ attachments: [...n.attachments, { url, name, type: asset.mimeType ?? "image/jpeg" }] });
    } catch (error) {
      appAlert("Could not upload the photo", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const save = async (publish: boolean) => {
    if (!token) return;
    const check = publish ? problem : n.title.trim() ? null : "Give the notice a title";
    if (check) return appAlert("Not yet", check);
    setAction(publish ? "post" : "draft");
    setBusy(true);
    try {
      const payload: NoticeInput = {
        ...n,
        startDate: dated ? n.startDate : null,
        endDate: dated && multiDay && !repeat ? n.endDate : null,
        startTime: dated ? n.startTime : null,
        endTime: dated ? n.endTime : null,
        recurrence: dated ? n.recurrence : null,
        reminders: dated ? n.reminders : [],
      };
      const saved = editing ? await updateNotice(token, editing.id, payload, notifyChange) : await createNotice(token, payload, publish);
      appAlert(editing ? "Saved" : publish ? "Posted" : "Draft saved", undefined, [{ text: "OK", onPress: () => router.replace(`/notice/${saved.id}` as never) }], "success");
    } catch (error) {
      appAlert("Could not save the notice", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title={editing ? "Edit notice" : "New notice"} backTo="/noticeboard">
      {/* Where you are: three short steps. */}
      <View style={styles.steps} accessibilityLabel={`Step ${step} of 4`}>
        {(["What", "Who", "When", "Preview"] as const).map((label, index) => {
          const num = (index + 1) as 1 | 2 | 3 | 4;
          return (
            <View key={label} style={styles.stepCol}>
              <View style={[styles.stepBar, step >= num && styles.stepBarOn]} />
              <Text style={[styles.stepText, step === num && styles.stepTextOn]} numberOfLines={1}>
                {step > num ? "✓ " : `${num}. `}
                {label}
              </Text>
            </View>
          );
        })}
      </View>
      {step === 1 && (
        <>
      <Card style={styles.card}>
        <Text style={styles.heading}>Kind of notice</Text>
        <View style={styles.chips}>
          {NOTICE_CATEGORIES.map((c) => (
            <Chip key={c.key} on={n.category === c.key} color={c.color} icon={c.icon} onPress={() => set({ category: c.key })}>
              {c.label}
            </Chip>
          ))}
        </View>
        <Text style={styles.heading}>Title</Text>
        <TextInput style={styles.input} value={n.title} maxLength={160} onChangeText={(title) => set({ title })} placeholder="Team meeting" placeholderTextColor={colors.mutedForeground} accessibilityLabel="Title" />
        <Text style={styles.heading}>Details</Text>
        <TextInput style={[styles.input, styles.multiline]} value={n.body} maxLength={5000} onChangeText={(body) => set({ body })} multiline placeholder="Agenda, venue, what to bring…" placeholderTextColor={colors.mutedForeground} accessibilityLabel="Details" />
      </Card>
      <Card style={styles.card}>
        <Text style={styles.heading}>Photos</Text>
        <View style={styles.chips}>
          {n.attachments.map((a, i) => (
            <Pressable key={a.url} accessibilityRole="button" accessibilityLabel={`Remove ${a.name}`} style={styles.chip} onPress={() => set({ attachments: n.attachments.filter((_, j) => j !== i) })}>
              <Text style={styles.chipText}>{a.name}  ✕</Text>
            </Pressable>
          ))}
        </View>
        {uploading && (
          <View style={styles.uploading} accessibilityRole="progressbar" accessibilityLabel="Uploading the photo">
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.muted}>Uploading the photo…</Text>
          </View>
        )}
        <Button variant="outline" loading={uploading} disabled={uploading || n.attachments.length >= 5} onPress={attach} icon={<Ionicons name="image-outline" size={18} color={colors.primary} />}>
          {uploading ? "Uploading…" : "Add a photo"}
        </Button>
      </Card>
        </>
      )}
      {step === 2 && (
      <Card style={styles.card}>
        <Text style={styles.heading}>Who is it for</Text>
        {isAdmin && <Row label="Everyone in the organisation" value={n.audience.all} onChange={(all) => setAudience({ all })} />}
        {!n.audience.all && (
          <>
            <Text style={styles.label}>SITES</Text>
            <View style={styles.chips}>
              {mySites.length === 0 && <Text style={styles.muted}>No sites to choose from.</Text>}
              {mySites.map((s) => (
                <Chip key={s.id} on={n.audience.siteIds.includes(s.id)} onPress={() => setAudience({ siteIds: toggle(n.audience.siteIds, s.id) })}>
                  {s.name}
                </Chip>
              ))}
            </View>
            <Text style={styles.label}>ROLES{n.audience.siteIds.length > 0 && n.audience.roles.length > 0 ? " (AT THE CHOSEN SITES)" : ""}</Text>
            <View style={styles.chips}>
              {roleKeys.map((k) => (
                <Chip key={k} on={n.audience.roles.includes(k)} onPress={() => setAudience({ roles: toggle(n.audience.roles, k) })}>
                  {roleLabel(k)}
                </Chip>
              ))}
            </View>
            <Text style={styles.label}>NAMED PEOPLE</Text>
            <TextInput style={styles.input} value={filter} onChangeText={setFilter} placeholder="Find a person" placeholderTextColor={colors.mutedForeground} accessibilityLabel="Find a person" />
            <View style={styles.chips}>
              {shownPeople.map((p) => (
                <Chip key={p.id} on={n.audience.userIds.includes(p.id)} onPress={() => setAudience({ userIds: toggle(n.audience.userIds, p.id) })}>
                  {p.name}
                </Chip>
              ))}
            </View>
          </>
        )}
        <Text style={styles.reach}>{reach === 0 ? "Nobody chosen yet" : `${reach} ${reach === 1 ? "person" : "people"} will be told`}</Text>
      </Card>
      )}
      {step === 3 && (
        <>
      <Card style={styles.card}>
        <Row
          label="It is for a specific day"
          value={dated}
          onChange={(v) => {
            setDated(v);
            if (v && !n.startDate) set({ startDate: today });
          }}
        />
        {dated && (
          <>
            <View style={styles.chips}>
              {(
                [
                  ["Today", 0],
                  ["Tomorrow", 1],
                ] as const
              ).map(([label, add]) => {
                const d = new Date();
                d.setDate(d.getDate() + add);
                return (
                  <Chip key={label} on={n.startDate === dateKey(d)} onPress={() => set({ startDate: dateKey(d) })}>
                    {label}
                  </Chip>
                );
              })}
            </View>
            <View style={styles.pair}>
              <TextInput style={[styles.input, styles.flex]} value={n.startDate ?? ""} onChangeText={(v) => set({ startDate: v || null })} placeholder={multiDay ? "From 2026-12-08" : "Date 2026-12-08"} placeholderTextColor={colors.mutedForeground} autoCapitalize="none" accessibilityLabel="Date" />
              {multiDay && !repeat && (
                <TextInput style={[styles.input, styles.flex]} value={n.endDate ?? ""} onChangeText={(v) => set({ endDate: v || null })} placeholder="To 2026-12-10" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" accessibilityLabel="End date" />
              )}
            </View>
            <View style={styles.pair}>
              <TextInput style={[styles.input, styles.flex]} value={n.startTime ?? ""} onChangeText={(v) => set({ startTime: v || null })} placeholder="Starts 08:00" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" keyboardType="numbers-and-punctuation" accessibilityLabel="Starts" />
              <TextInput style={[styles.input, styles.flex]} value={n.endTime ?? ""} onChangeText={(v) => set({ endTime: v || null })} placeholder="Ends 09:00" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" keyboardType="numbers-and-punctuation" accessibilityLabel="Ends" />
            </View>
            <View style={styles.chips}>
              {!repeat && (
                <Chip on={multiDay} onPress={() => { setMultiDay(!multiDay); if (multiDay) set({ endDate: null }); }}>
                  Spans several days
                </Chip>
              )}
              <Chip
                on={repeat}
                onPress={() => {
                  setMultiDay(false);
                  set({ endDate: null, recurrence: repeat ? null : { weekdays: [n.startDate ? weekdayOf(n.startDate) : 0], until: n.startDate ?? today } });
                }}
              >
                Repeats weekly
              </Chip>
            </View>
            {n.recurrence && (
              <>
                <View style={styles.chips}>
                  {WEEKDAYS.map((label, i) => (
                    <Chip key={label} on={n.recurrence!.weekdays.includes(i)} onPress={() => set({ recurrence: { ...n.recurrence!, weekdays: toggle(n.recurrence!.weekdays, i).sort() } })}>
                      {label}
                    </Chip>
                  ))}
                </View>
                <TextInput style={styles.input} value={n.recurrence.until} onChangeText={(until) => set({ recurrence: { ...n.recurrence!, until } })} placeholder="Repeats until 2026-12-22" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" accessibilityLabel="Repeats until" />
              </>
            )}
            <Text style={styles.heading}>Remind people</Text>
            <View style={styles.chips}>
              {REMINDER_OPTIONS.map((r) => (
                <Chip key={r.key} on={n.reminders.includes(r.key)} onPress={() => set({ reminders: toggle<NoticeReminder>(n.reminders, r.key) })}>
                  {r.label}
                </Chip>
              ))}
            </View>
            {n.reminders.includes("1h") && !n.startTime && <Text style={styles.muted}>&quot;An hour before&quot; needs a start time.</Text>}
          </>
        )}
      </Card>
      <Card style={styles.card}>
        <Row label="Pin to the top" value={n.pinned} onChange={(pinned) => set({ pinned })} />
        <Row label="People must acknowledge it" hint="Shows who has not" value={n.requiresAck} onChange={(requiresAck) => set({ requiresAck })} />
        <Row label="Also send an email" hint={n.category === "safety" ? "Safety notices are always emailed" : undefined} value={n.alsoEmail || n.category === "safety"} onChange={(alsoEmail) => set({ alsoEmail })} />
      </Card>
      {published && (
        <Card style={styles.card}>
          <Row label="Tell people about this change" hint="Only sent if the date, time or title changed." value={notifyChange} onChange={setNotifyChange} />
        </Card>
      )}
          {!!problem && !editing && <Text style={styles.error}>{problem}</Text>}
        </>
      )}
      {step === 4 && (
        <>
          <Text style={styles.label}>PREVIEW · THIS IS WHAT PEOPLE WILL SEE</Text>
          <View style={styles.previewFrame}>
            <NoticeContent
              category={n.category}
              pinned={n.pinned}
              title={n.title}
              byline={`${currentUser?.name ?? "You"} · ${roleLabel(currentUser?.role)} · just now`}
              whenText={whenTextOf(effective)}
              forText={audienceText(n.audience, (id) => state.sites.find((x) => x.id === id)?.name ?? "A site", (k) => roleLabel(k))}
              body={n.body}
              attachments={n.attachments}
              requiresAck={n.requiresAck}
              emailed={n.alsoEmail || n.category === "safety"}
            />
            {n.requiresAck && (
              <Button disabled onPress={() => undefined} icon={<Ionicons name="checkmark" size={20} color={colors.primaryForeground} />}>
                I have read and understood
              </Button>
            )}
          </View>
          <Text style={styles.muted}>
            {reach > 0 ? `${reach} ${reach === 1 ? "person" : "people"} will be told` : "Nobody chosen yet"}
            {effective.reminders.length > 0 && effective.startDate ? `, with ${effective.reminders.length === 1 ? "a reminder" : `${effective.reminders.length} reminders`}` : ""}.
          </Text>
          {!!problem && !editing && <Text style={styles.error}>{problem}</Text>}
        </>
      )}
      <View style={styles.actions}>
        {step === 1 ? (
          <Button disabled={!n.title.trim() || uploading} onPress={() => setStep(2)}>
            Next: who
          </Button>
        ) : step === 2 ? (
          <>
            <Button disabled={!audienceChosen} onPress={() => setStep(3)}>
              Next: when
            </Button>
            <Button variant="outline" onPress={() => setStep(1)}>
              Back
            </Button>
          </>
        ) : step === 3 ? (
          <>
            <Button disabled={!editing && !!problem} onPress={() => setStep(4)}>
              Next: preview
            </Button>
            <Button variant="outline" onPress={() => setStep(2)}>
              Back
            </Button>
          </>
        ) : (
          <>
            <Button loading={busy && action === "post"} disabled={busy || (!editing && !!problem)} onPress={() => void save(true)}>
              {editing ? "Save changes" : reach > 0 ? `Post to ${reach} ${reach === 1 ? "person" : "people"}` : "Post"}
            </Button>
            {!editing && (
              <Button variant="outline" loading={busy && action === "draft"} disabled={busy} onPress={() => void save(false)}>
                Save as draft
              </Button>
            )}
            <Button variant="outline" disabled={busy} onPress={() => setStep(3)}>
              Back
            </Button>
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    card: { marginBottom: spacing.md, gap: spacing.sm },
    heading: { fontSize: typography.body, fontWeight: "800", color: colors.foreground, marginTop: spacing.xs },
    label: { fontSize: 10, letterSpacing: 0.8, fontWeight: "700", color: colors.mutedForeground, marginTop: spacing.xs },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    value: { fontSize: typography.body, color: colors.foreground },
    error: { fontSize: typography.small, color: colors.destructive, marginBottom: spacing.sm },
    reach: { fontSize: typography.small, fontWeight: "700", color: colors.primary },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    chip: { paddingHorizontal: spacing.md, minHeight: 40, justifyContent: "center", borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipInner: { flexDirection: "row", alignItems: "center", gap: 6 },
    chipText: { fontSize: typography.small, fontWeight: "600", color: colors.mutedForeground },
    chipTextOn: { color: colors.primaryForeground },
    pair: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    flex: { flex: 1, minWidth: 0 },
    rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, minHeight: 44 },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.foreground, backgroundColor: colors.card, fontSize: 16, minHeight: 44 },
    multiline: { minHeight: 90, textAlignVertical: "top" },
    steps: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
    stepCol: { flex: 1, minWidth: 0, gap: 4 },
    stepBar: { height: 6, borderRadius: 3, backgroundColor: colors.muted },
    stepBarOn: { backgroundColor: colors.primary },
    stepText: { fontSize: typography.small, fontWeight: "700", color: colors.mutedForeground },
    stepTextOn: { color: colors.foreground },
    previewFrame: { gap: spacing.md, padding: spacing.sm, borderRadius: 26, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, backgroundColor: colors.muted },
    uploading: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    actions: { gap: spacing.sm, marginBottom: spacing.xl },
  }),
);
