import { useCallback, useMemo, useState } from "react";
import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { appAlert } from "@/components/Dialog";
import { useSmartClean } from "@/features/store";
import {
  createMaintenanceContractor,
  deleteMaintenanceContractor,
  getMaintenanceMe,
  listMaintenanceContractors,
  updateMaintenanceContractor,
  type MaintenanceCapabilities,
  type MaintenanceContractor,
} from "@/api/client";
import {
  CONTRACTOR_SUGGESTIONS,
  categoriesInUse,
  filterContractors,
  initialsOf,
  orderContractors,
  telLink,
  usageText,
  whatsappLink,
} from "@/domain/maintenanceContractors";
import {
  colors,
  radius,
  spacing,
  typography,
  themedStyles,
  useThemeVersion,
} from "@/theme";

/** The contractors maintenance calls on: its own list, with one-tap call and WhatsApp, and add, edit and remove. */
export default function ContractorsScreen() {
  useThemeVersion();
  const { state } = useSmartClean();
  const token = state.accessToken;
  const [list, setList] = useState<MaintenanceContractor[] | null>(null);
  const [caps, setCaps] = useState<MaintenanceCapabilities | undefined>();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<MaintenanceContractor | "new" | null>(
    null,
  );

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [rows, me] = await Promise.all([
        listMaintenanceContractors(token, true),
        getMaintenanceMe(token),
      ]);
      setList(rows);
      setCaps(me.capabilities);
    } catch (error) {
      setList([]);
      appAlert(
        "Could not load contractors",
        error instanceof Error ? error.message : "Try again in a moment.",
      );
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const active = useMemo(() => (list ?? []).filter((c) => c.active), [list]);
  const archived = useMemo(() => (list ?? []).filter((c) => !c.active), [list]);
  const shown = useMemo(
    () =>
      orderContractors(
        filterContractors(showArchived ? archived : active, query, category),
      ),
    [active, archived, showArchived, query, category],
  );
  const kinds = useMemo(() => categoriesInUse(active), [active]);

  return (
    <Screen title="Contractors">
      <View style={styles.body}>
        <Button
          icon={
            <Ionicons name="add" size={18} color={colors.primaryForeground} />
          }
          onPress={() => setEditing("new")}
        >
          Add a contractor
        </Button>

        <View style={styles.search}>
          <Ionicons name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name or kind of work"
            placeholderTextColor={colors.mutedForeground}
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel="Search contractors"
            style={styles.searchInput}
          />
        </View>

        {kinds.length > 1 && !showArchived && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            <Chip
              on={category === null}
              onPress={() => setCategory(null)}
              label={`Everyone  ${active.length}`}
            />
            {kinds.map((k) => (
              <Chip
                key={k.name}
                on={category === k.name}
                onPress={() => setCategory(category === k.name ? null : k.name)}
                label={`${k.name}  ${k.count}`}
              />
            ))}
          </ScrollView>
        )}

        {list === null ? (
          <Text style={styles.muted}>Loading…</Text>
        ) : shown.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={28} color={colors.primary} />
            <Text style={styles.emptyTitle}>
              {query || category
                ? "No contractors match"
                : showArchived
                  ? "Nothing archived"
                  : "No contractors yet"}
            </Text>
            <Text style={styles.muted}>
              {query || category
                ? "Try different words, or clear the filter."
                : "Add the people you call when something breaks, so a quote is two taps."}
            </Text>
          </View>
        ) : (
          shown.map((c) => {
            const call = telLink(c.phone);
            const chat = whatsappLink(c.phone);
            return (
              <View key={c.id} style={[styles.card, !c.active && styles.dim]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${c.name}. Edit`}
                  onPress={() => setEditing(c)}
                  style={styles.cardMain}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initialsOf(c.name)}</Text>
                  </View>
                  <View style={styles.flex}>
                    <View style={styles.line}>
                      <Text style={styles.name} numberOfLines={1}>
                        {c.name}
                      </Text>
                      {c.preferred ? (
                        <Ionicons
                          name="star"
                          size={14}
                          color={colors.warning}
                        />
                      ) : null}
                    </View>
                    <Text style={styles.muted} numberOfLines={1}>
                      {[c.contactPerson, c.phone].filter(Boolean).join(" · ") ||
                        "No contact details yet"}
                    </Text>
                    {c.categories.length > 0 && (
                      <View style={styles.tags}>
                        {c.categories.map((k) => (
                          <Text key={k} style={styles.tag}>
                            {k}
                          </Text>
                        ))}
                      </View>
                    )}
                    <Text style={styles.tiny}>
                      {c.active ? usageText(c) : "Archived"}
                    </Text>
                  </View>
                </Pressable>
                {(call || chat || c.email) && (
                  <View style={styles.actions}>
                    {call ? (
                      <Round
                        icon="call-outline"
                        label={`Call ${c.name}`}
                        onPress={() => void Linking.openURL(call)}
                      />
                    ) : null}
                    {chat ? (
                      <Round
                        icon="logo-whatsapp"
                        label={`WhatsApp ${c.name}`}
                        onPress={() => void Linking.openURL(chat)}
                      />
                    ) : null}
                    {c.email ? (
                      <Round
                        icon="mail-outline"
                        label={`Email ${c.name}`}
                        onPress={() =>
                          void Linking.openURL(`mailto:${c.email}`)
                        }
                      />
                    ) : null}
                  </View>
                )}
              </View>
            );
          })
        )}

        {archived.length > 0 && (
          <Pressable
            onPress={() => setShowArchived((v) => !v)}
            style={styles.toggle}
            accessibilityRole="button"
          >
            <Text style={styles.toggleText}>
              {showArchived
                ? "Back to your contractors"
                : `Archived (${archived.length})`}
            </Text>
          </Pressable>
        )}
      </View>

      <ContractorSheet
        contractor={editing === "new" ? null : editing}
        visible={editing !== null}
        caps={caps}
        token={token}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void load();
        }}
      />
    </Screen>
  );
}

function Chip({
  on,
  onPress,
  label,
}: {
  on: boolean;
  onPress: () => void;
  label: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={[styles.chip, on && styles.chipOn]}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

function Round({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.round}
    >
      <Ionicons name={icon} size={18} color={colors.foreground} />
    </Pressable>
  );
}

function ContractorSheet({
  contractor,
  visible,
  caps,
  token,
  onClose,
  onSaved,
}: {
  contractor: MaintenanceContractor | null;
  visible: boolean;
  caps: MaintenanceCapabilities | undefined;
  token: string | null | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const insets = useSafeAreaInsets();
  const editing = contractor !== null;
  const [name, setName] = useState("");
  const [person, setPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [preferred, setPreferred] = useState(false);
  const [notes, setNotes] = useState("");
  const [bank, setBank] = useState({ name: "", branch: "", account: "" });
  const [busy, setBusy] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Fill the form when a contractor is opened, and empty it for a new one.
  const key = visible ? (contractor?.id ?? "new") : null;
  if (key !== loadedFor) {
    setLoadedFor(key);
    if (key !== null) {
      setName(contractor?.name ?? "");
      setPerson(contractor?.contactPerson ?? "");
      setPhone(contractor?.phone ?? "");
      setEmail(contractor?.email ?? "");
      setCategories(contractor?.categories ?? []);
      setPreferred(contractor?.preferred ?? false);
      setNotes(contractor?.notes ?? "");
      setBank({
        name: contractor?.bankName ?? "",
        branch: contractor?.bankBranchCode ?? "",
        account: contractor?.bankAccountNumber ?? "",
      });
      setCustom("");
    }
  }

  const mailOk =
    email.trim() === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const valid = name.trim().length >= 2 && mailOk;
  const has = (k: string) =>
    categories.some((x) => x.toLowerCase() === k.toLowerCase());
  const toggle = (k: string) =>
    setCategories((cur) =>
      has(k)
        ? cur.filter((x) => x.toLowerCase() !== k.toLowerCase())
        : [...cur, k],
    );

  async function save() {
    if (!token) return;
    setBusy(true);
    const body = {
      name: name.trim(),
      contactPerson: person.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      categories,
      preferred,
      notes: notes.trim() || null,
      ...(caps?.pay
        ? {
            bankName: bank.name.trim() || null,
            bankBranchCode: bank.branch.trim() || null,
            bankAccountNumber: bank.account.trim() || null,
          }
        : {}),
    };
    try {
      if (contractor)
        await updateMaintenanceContractor(token, contractor.id, body);
      else await createMaintenanceContractor(token, body);
      onSaved();
    } catch (error) {
      appAlert(
        "Could not save the contractor",
        error instanceof Error ? error.message : "Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    if (!contractor || !token) return;
    appAlert(
      `Remove ${contractor.name}?`,
      contractor.jobs > 0
        ? "They have been on jobs, so they are archived: old quotes and jobs keep their name, and you can restore them."
        : "They have not been used, so they are deleted.",
      [
        { text: "Keep them", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteMaintenanceContractor(token, contractor.id);
              onSaved();
            } catch (error) {
              appAlert(
                "Could not remove the contractor",
                error instanceof Error ? error.message : "Try again.",
              );
            }
          },
        },
      ],
    );
  }

  async function restore() {
    if (!contractor || !token) return;
    try {
      await updateMaintenanceContractor(token, contractor.id, { active: true });
      onSaved();
    } catch (error) {
      appAlert(
        "Could not restore the contractor",
        error instanceof Error ? error.message : "Try again.",
      );
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View
        style={[
          styles.sheet,
          { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom },
        ]}
      >
        <View style={styles.sheetBar}>
          <Text style={styles.sheetTitle}>
            {editing ? contractor.name : "Add a contractor"}
          </Text>
          <Pressable
            accessibilityLabel="Close"
            onPress={onClose}
            hitSlop={10}
            style={styles.round}
          >
            <Ionicons name="close" size={20} color={colors.foreground} />
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={styles.sheetBody}
          keyboardShouldPersistTaps="handled"
        >
          {editing && !contractor.active ? (
            <View style={styles.note}>
              <Text style={styles.muted}>
                This contractor is archived and is not offered for new work.
              </Text>
              <Button variant="outline" onPress={restore}>
                Restore
              </Button>
            </View>
          ) : null}
          {/* A live card, the way this contractor will look in the list. */}
          <View style={styles.preview}>
            <View
              style={[
                styles.previewAvatar,
                name.trim() ? styles.previewAvatarOn : null,
              ]}
            >
              {name.trim() ? (
                <Text style={styles.previewInitials}>{initialsOf(name)}</Text>
              ) : (
                <Ionicons
                  name="people-outline"
                  size={24}
                  color={colors.mutedForeground}
                />
              )}
            </View>
            <View style={styles.flex}>
              <View style={styles.line}>
                <Text
                  style={[styles.previewName, !name.trim() && styles.muted]}
                  numberOfLines={1}
                >
                  {name.trim() || "New contractor"}
                </Text>
                {preferred ? (
                  <Ionicons name="star" size={16} color={colors.warning} />
                ) : null}
              </View>
              <Text style={styles.muted} numberOfLines={1}>
                {[person.trim(), phone.trim()].filter(Boolean).join(" · ") ||
                  "Add who to call and how"}
              </Text>
              {categories.length > 0 ? (
                <View style={styles.tags}>
                  {categories.slice(0, 4).map((k) => (
                    <Text key={k} style={styles.tag}>
                      {k}
                    </Text>
                  ))}
                  {categories.length > 4 ? (
                    <Text style={styles.muted}>+{categories.length - 4}</Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>

          <Text style={styles.group}>Who</Text>
          <Field
            icon="people-outline"
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="For example: Spark Electrical"
          />
          <Field
            icon="person-outline"
            label="Who do you speak to?"
            value={person}
            onChangeText={setPerson}
            placeholder="Their name"
          />

          <Text style={styles.group}>How to reach them</Text>
          <Field
            icon="call-outline"
            label="Phone"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="082 123 4567"
          />
          <Field
            icon="mail-outline"
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="name@company.co.za"
            invalid={!mailOk}
            valid={email.trim() !== "" && mailOk}
          />
          {!mailOk ? (
            <Text style={styles.warn}>
              That email address does not look right.
            </Text>
          ) : null}

          <Text style={styles.group}>What do they do?</Text>
          <View style={styles.tags}>
            {[
              ...CONTRACTOR_SUGGESTIONS,
              ...categories.filter(
                (k) =>
                  !CONTRACTOR_SUGGESTIONS.some(
                    (s) => s.toLowerCase() === k.toLowerCase(),
                  ),
              ),
            ].map((k) => (
              <Pressable
                key={k}
                accessibilityRole="button"
                accessibilityState={{ selected: has(k) }}
                onPress={() => toggle(k)}
                style={[styles.kind, has(k) && styles.kindOn]}
              >
                <Ionicons
                  name={tradeIcon(k)}
                  size={16}
                  color={
                    has(k) ? colors.primaryForeground : colors.mutedForeground
                  }
                />
                <Text style={[styles.kindText, has(k) && styles.kindTextOn]}>
                  {k}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.row}>
            <TextInput
              value={custom}
              onChangeText={setCustom}
              placeholder="Something else, then Add"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, styles.flex]}
              accessibilityLabel="Add another kind of work"
            />
            <Button
              variant="outline"
              fullWidth={false}
              disabled={!custom.trim()}
              onPress={() => {
                const k = custom.trim();
                if (k && !has(k)) setCategories((cur) => [...cur, k]);
                setCustom("");
              }}
            >
              Add
            </Button>
          </View>

          <Text style={styles.group}>Details</Text>
          <View style={[styles.switchRow, preferred && styles.switchRowOn]}>
            <Ionicons
              name={preferred ? "star" : "star-outline"}
              size={20}
              color={preferred ? colors.warning : colors.mutedForeground}
            />
            <View style={styles.flex}>
              <Text style={styles.label}>Preferred</Text>
              <Text style={styles.muted}>
                Your first call for this work. They are listed first.
              </Text>
            </View>
            <Switch
              value={preferred}
              onValueChange={setPreferred}
              accessibilityLabel="Preferred contractor"
            />
          </View>

          <Field
            label="Notes (optional)"
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="Hours, call-out fees, who to ask for"
          />

          {caps?.pay ? (
            <>
              <Text style={styles.group}>Bank details</Text>
              <Field
                label="Bank"
                value={bank.name}
                onChangeText={(v) => setBank({ ...bank, name: v })}
              />
              <Field
                label="Branch code"
                value={bank.branch}
                onChangeText={(v) => setBank({ ...bank, branch: v })}
                keyboardType="number-pad"
              />
              <Field
                label="Account number"
                value={bank.account}
                onChangeText={(v) => setBank({ ...bank, account: v })}
                keyboardType="number-pad"
              />
              <Text style={styles.muted}>
                Only people who pay for maintenance can see these.
              </Text>
            </>
          ) : null}

          {editing && contractor.active ? (
            <Pressable
              accessibilityRole="button"
              onPress={remove}
              style={styles.remove}
            >
              <Ionicons
                name="trash-outline"
                size={16}
                color={colors.destructive}
              />
              <Text style={styles.removeText}>Remove this contractor</Text>
            </Pressable>
          ) : null}
        </ScrollView>
        <View style={styles.sheetFoot}>
          <Button disabled={!valid || busy} loading={busy} onPress={save}>
            {editing ? "Save" : "Add contractor"}
          </Button>
        </View>
      </View>
    </Modal>
  );
}

const TRADE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  electrical: "flash-outline",
  plumbing: "water-outline",
  generator: "power-outline",
  "kitchen equipment": "restaurant-outline",
  "sound & lighting": "bulb-outline",
  "air conditioning": "snow-outline",
  carpentry: "hammer-outline",
  painting: "color-palette-outline",
  security: "shield-checkmark-outline",
  general: "construct-outline",
};
const tradeIcon = (kind: string): keyof typeof Ionicons.glyphMap =>
  TRADE_ICON[kind.toLowerCase()] ?? "construct-outline";

function Field({
  icon,
  invalid,
  valid,
  label,
  value,
  onChangeText,
  multiline,
  placeholder,
  keyboardType,
  autoCapitalize,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  invalid?: boolean;
  valid?: boolean;
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  multiline?: boolean;
  placeholder?: string;
  keyboardType?: "default" | "phone-pad" | "email-address" | "number-pad";
  autoCapitalize?: "none" | "sentences";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputWrap, invalid && styles.inputInvalid]}>
        {icon ? (
          <Ionicons name={icon} size={18} color={colors.mutedForeground} />
        ) : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          multiline={multiline}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          accessibilityLabel={label}
          style={[styles.inputBare, multiline && styles.multiline]}
        />
        {valid ? (
          <Ionicons name="checkmark-circle" size={18} color={colors.success} />
        ) : null}
      </View>
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    body: { gap: spacing.sm },
    flex: { flex: 1, minWidth: 0 },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    tiny: {
      fontSize: typography.tiny,
      color: colors.mutedForeground,
      marginTop: 4,
    },
    warn: { fontSize: typography.small, color: colors.destructive },
    search: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.xl,
      paddingHorizontal: spacing.md,
      minHeight: 44,
      backgroundColor: colors.card,
    },
    searchInput: {
      flex: 1,
      fontSize: typography.body,
      color: colors.foreground,
      paddingVertical: spacing.xs,
    },
    chips: { gap: spacing.xs, paddingVertical: 2 },
    chip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.xl,
      paddingHorizontal: spacing.md,
      minHeight: 36,
      justifyContent: "center",
      backgroundColor: colors.card,
    },
    chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: {
      fontSize: typography.small,
      fontWeight: "700",
      color: colors.foreground,
    },
    chipTextOn: { color: colors.primaryForeground },
    empty: { alignItems: "center", gap: spacing.xs, padding: spacing.xl },
    emptyTitle: {
      fontSize: typography.body,
      fontWeight: "700",
      color: colors.foreground,
    },
    card: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.xl,
      backgroundColor: colors.card,
      padding: spacing.sm,
      gap: spacing.sm,
    },
    dim: { opacity: 0.7 },
    cardMain: { flexDirection: "row", gap: spacing.sm },
    avatar: {
      width: 46,
      height: 46,
      borderRadius: 23,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.muted,
    },
    avatarText: {
      fontSize: typography.small,
      fontWeight: "800",
      color: colors.primary,
    },
    line: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
    name: {
      fontSize: typography.body,
      fontWeight: "700",
      color: colors.foreground,
      flexShrink: 1,
    },
    tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
    tag: {
      fontSize: typography.tiny,
      fontWeight: "700",
      color: colors.mutedForeground,
      backgroundColor: colors.muted,
      borderRadius: radius.md,
      paddingHorizontal: 8,
      paddingVertical: 2,
      overflow: "hidden",
    },
    actions: {
      flexDirection: "row",
      gap: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: spacing.sm,
    },
    round: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.muted,
    },
    toggle: { alignSelf: "center", minHeight: 44, justifyContent: "center" },
    toggleText: {
      fontSize: typography.small,
      fontWeight: "700",
      color: colors.mutedForeground,
    },
    sheet: { flex: 1, backgroundColor: colors.background },
    sheetBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    sheetTitle: {
      flex: 1,
      fontSize: typography.body,
      fontWeight: "800",
      color: colors.foreground,
    },
    sheetBody: { padding: spacing.md, gap: spacing.sm },
    sheetFoot: {
      padding: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    field: { gap: 4 },
    label: {
      fontSize: typography.small,
      fontWeight: "700",
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
    multiline: { minHeight: 90, textAlignVertical: "top" },
    row: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
    group: {
      fontSize: typography.tiny,
      fontWeight: "800",
      letterSpacing: 1.4,
      textTransform: "uppercase",
      color: colors.mutedForeground,
      marginTop: spacing.sm,
    },
    preview: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.xl,
      backgroundColor: colors.card,
      padding: spacing.md,
    },
    previewAvatar: {
      width: 56,
      height: 56,
      borderRadius: radius.xl,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.muted,
    },
    previewAvatarOn: { backgroundColor: colors.primary },
    previewInitials: {
      fontSize: typography.body,
      fontWeight: "800",
      color: colors.primaryForeground,
    },
    previewName: {
      fontSize: typography.body,
      fontWeight: "800",
      color: colors.foreground,
      flexShrink: 1,
    },
    inputWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: colors.input,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.card,
    },
    inputInvalid: { borderColor: colors.destructive },
    inputBare: {
      flex: 1,
      minHeight: 46,
      paddingVertical: spacing.sm,
      fontSize: typography.body,
      color: colors.foreground,
    },
    switchRowOn: {
      borderColor: colors.warning,
      backgroundColor: colors.warningSoft,
    },
    kind: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.xl,
      paddingHorizontal: spacing.md,
      minHeight: 36,
      justifyContent: "center",
      backgroundColor: colors.card,
    },
    kindOn: { borderColor: colors.primary, backgroundColor: colors.primary },
    kindText: {
      fontSize: typography.small,
      fontWeight: "700",
      color: colors.foreground,
    },
    kindTextOn: { color: colors.primaryForeground },
    switchRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.xl,
      padding: spacing.sm,
    },
    note: {
      gap: spacing.sm,
      backgroundColor: colors.muted,
      borderRadius: radius.xl,
      padding: spacing.sm,
    },
    remove: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs,
      minHeight: 48,
    },
    removeText: {
      fontSize: typography.small,
      fontWeight: "700",
      color: colors.destructive,
    },
  }),
);
