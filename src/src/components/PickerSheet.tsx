import { useMemo, useState, type ReactNode } from "react";
import { Modal, Pressable, SectionList, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, themedStyles, typography, useThemeVersion } from "@/theme";

/**
 * Choosing one thing from a list that may be long (50 roles, 100 sites, every organisation): a row on the form that
 * shows the current choice and how many there are, the last few choices as one-tap shortcuts, and a bottom sheet with
 * search, filter chips with counts, the recent ones first and the rest in groups.
 */

type Glyph = keyof typeof Ionicons.glyphMap;

export type PickerItem = {
  key: string;
  label: string;
  /** Second line, and also searched (a site's address, an organisation's plan). */
  sub?: string;
  icon?: Glyph;
  /** Heading it sits under in the sheet ("Field staff"); items without one go under "All". */
  group?: string;
  /** Small tag at the end of the row ("Trial"). */
  tag?: string;
};

export type PickerFilter = { key: string; label: string; test: (item: PickerItem) => boolean };

/** The form row: the current choice (or a prompt), and how many there are to choose from. */
export function PickerRow({
  label,
  icon,
  value,
  sub,
  placeholder,
  count,
  onPress,
  disabled,
}: {
  label: string;
  icon: Glyph;
  value?: string;
  sub?: string;
  placeholder: string;
  count?: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  useThemeVersion();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}: ${value}. Change` : placeholder}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <View style={styles.flex}>
        {value ? (
          <>
            <Text style={styles.rowLabel}>{label}</Text>
            <Text style={styles.rowValue} numberOfLines={1}>
              {value}
            </Text>
            {sub ? (
              <Text style={styles.rowSub} numberOfLines={1}>
                {sub}
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.rowPlaceholder}>{placeholder}</Text>
        )}
      </View>
      {count ? <Text style={styles.count}>{count}</Text> : null}
      <Ionicons name="chevron-down" size={18} color={colors.mutedForeground} />
    </Pressable>
  );
}

/** "Recent" and up to three one-tap choices. Nothing when there are none. */
export function RecentChips({
  items,
  selected,
  onPick,
}: {
  items: { key: string; label: string }[];
  selected?: string | null;
  onPick: (key: string) => void;
}) {
  useThemeVersion();
  if (items.length === 0) return null;
  return (
    <View style={styles.recentRow}>
      <Ionicons name="time-outline" size={13} color={colors.mutedForeground} />
      <Text style={styles.recentLabel}>Recent</Text>
      {items.map((item) => {
        const on = item.key === selected;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onPick(item.key)}
            style={[styles.recentChip, on && styles.recentChipOn]}
          >
            <Text style={[styles.recentText, on && styles.recentTextOn]} numberOfLines={1}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Lower-case, accent-free text for matching ("Šoma" matches "soma"). */
function fold(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function PickerSheet({
  visible,
  title,
  searchPlaceholder,
  items,
  selected,
  recent,
  filters,
  noun,
  emptyHint,
  footer,
  onPick,
  onClose,
}: {
  visible: boolean;
  title: string;
  searchPlaceholder: string;
  items: PickerItem[];
  selected?: string | null;
  /** Keys to show first, under "Recent", while not searching. */
  recent?: string[];
  filters?: PickerFilter[];
  /** Plural noun for counts: "roles", "sites". */
  noun: string;
  emptyHint: string;
  footer?: ReactNode;
  onPick: (key: string) => void;
  onClose: () => void;
}) {
  useThemeVersion();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>("all");

  const active = filters?.find((f) => f.key === filter);
  const needle = fold(query.trim());

  const matches = useMemo(
    () =>
      items.filter(
        (item) =>
          (!active || active.test(item)) &&
          (!needle || fold(`${item.label} ${item.sub ?? ""}`).includes(needle)),
      ),
    [items, active, needle],
  );

  const sections = useMemo(() => {
    const out: { title: string; count?: number; data: PickerItem[] }[] = [];
    const recentItems =
      !needle && !active
        ? (recent ?? []).map((k) => items.find((i) => i.key === k)).filter((i): i is PickerItem => !!i)
        : [];
    if (recentItems.length) out.push({ title: "Recent", data: recentItems });
    const groups = new Map<string, PickerItem[]>();
    for (const item of [...matches].sort((a, b) => a.label.localeCompare(b.label))) {
      const g = item.group ?? "All";
      groups.set(g, [...(groups.get(g) ?? []), item]);
    }
    for (const [title, data] of groups) out.push({ title, count: data.length, data });
    return out;
  }, [matches, items, recent, needle, active]);

  const close = () => {
    setQuery("");
    setFilter("all");
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <View style={styles.modalRoot}>
        <Pressable style={styles.scrim} onPress={close} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom }]}>
          <View style={styles.handle} />
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} style={styles.closeBtn} hitSlop={8}>
              <Ionicons name="close" size={18} color={colors.foreground} />
            </Pressable>
          </View>

          <View style={styles.search}>
            <Ionicons name="search" size={17} color={colors.mutedForeground} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={searchPlaceholder}
              placeholderTextColor={colors.mutedForeground}
              autoCorrect={false}
              autoCapitalize="none"
              style={styles.searchInput}
              accessibilityLabel={searchPlaceholder}
            />
            {query ? (
              <Pressable onPress={() => setQuery("")} accessibilityLabel="Clear search" hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
              </Pressable>
            ) : null}
          </View>

          {filters && filters.length > 0 && (
            <View style={styles.filters}>
              {[{ key: "all", label: "All", test: () => true }, ...filters].map((f) => {
                const on = f.key === filter;
                const n = items.filter(f.test).length;
                return (
                  <Pressable
                    key={f.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => setFilter(f.key)}
                    style={[styles.filter, on && styles.filterOn]}
                  >
                    <Text style={[styles.filterText, on && styles.filterTextOn]}>
                      {f.label} {n}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          <SectionList
            sections={sections}
            keyExtractor={(item, index) => `${item.key}-${index}`}
            keyboardShouldPersistTaps="handled"
            stickySectionHeadersEnabled={false}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            renderSectionHeader={({ section }) => (
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                {section.count !== undefined ? <Text style={styles.sectionTitle}>{section.count}</Text> : null}
              </View>
            )}
            renderItem={({ item }) => {
              const on = item.key === selected;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => {
                    onPick(item.key);
                    close();
                  }}
                  style={({ pressed }) => [styles.item, pressed && styles.pressed]}
                >
                  <View style={[styles.itemIcon, on && styles.itemIconOn]}>
                    <Ionicons name={item.icon ?? "ellipse-outline"} size={17} color={on ? colors.primary : colors.mutedForeground} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={[styles.itemLabel, on && styles.itemLabelOn]} numberOfLines={1}>
                      {item.label}
                    </Text>
                    {item.sub ? (
                      <Text style={styles.itemSub} numberOfLines={1}>
                        {item.sub}
                      </Text>
                    ) : null}
                  </View>
                  {item.tag ? <Text style={styles.tag}>{item.tag}</Text> : null}
                  <View style={[styles.radio, on && styles.radioOn]}>
                    {on && <Ionicons name="checkmark" size={13} color={colors.primaryForeground} />}
                  </View>
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="search" size={30} color={colors.mutedForeground} />
                <Text style={styles.emptyTitle}>
                  {needle ? `No ${noun.replace(/s$/, "")} matches "${query.trim()}"` : `No ${noun} here`}
                </Text>
                <Text style={styles.emptyText}>{emptyHint}</Text>
              </View>
            }
          />

          <View style={styles.sheetFoot}>
            {footer ?? (
              <Text style={styles.footText}>
                {needle || active ? `${matches.length} of ${items.length} ${noun}` : `${items.length} ${noun} · type to search`}
              </Text>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    flex: { flex: 1, minWidth: 0 },
    pressed: { opacity: 0.85 },
    disabled: { opacity: 0.5 },

    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      minHeight: 62,
      paddingHorizontal: spacing.md + 2,
      paddingVertical: spacing.sm,
      borderRadius: 18,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    rowIcon: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    rowLabel: { fontSize: typography.tiny + 1, fontWeight: "600", color: colors.mutedForeground },
    rowValue: { fontSize: typography.body + 1, fontWeight: "700", color: colors.foreground },
    rowSub: { fontSize: typography.small, color: colors.mutedForeground },
    rowPlaceholder: { fontSize: typography.body + 1, color: colors.mutedForeground },
    count: {
      fontSize: typography.tiny + 1.5,
      color: colors.mutedForeground,
      backgroundColor: colors.secondary,
      borderRadius: radius.round,
      paddingHorizontal: 9,
      paddingVertical: 3,
      overflow: "hidden",
    },

    recentRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm, flexWrap: "wrap" },
    recentLabel: { fontSize: typography.small - 0.5, color: colors.mutedForeground, marginRight: 2 },
    recentChip: {
      height: 30,
      paddingHorizontal: 11,
      borderRadius: radius.round,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      justifyContent: "center",
      maxWidth: 150,
    },
    recentChipOn: { backgroundColor: colors.accent, borderColor: colors.primary },
    recentText: { fontSize: typography.small + 0.5, fontWeight: "600", color: colors.foreground },
    recentTextOn: { color: colors.primary },

    modalRoot: { flex: 1, justifyContent: "flex-end" },
    scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
    sheet: {
      maxHeight: "86%",
      minHeight: "60%",
      backgroundColor: colors.background,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      overflow: "hidden",
    },
    handle: { alignSelf: "center", width: 38, height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: 10, marginBottom: 8 },
    sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg + 2, paddingBottom: spacing.sm + 2 },
    sheetTitle: { fontSize: typography.h1 - 2, fontWeight: "800", color: colors.foreground },
    closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center" },
    search: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm + 2,
      marginHorizontal: spacing.lg + 2,
      marginBottom: spacing.sm + 2,
      height: 46,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.round,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    searchInput: { flex: 1, fontSize: typography.body + 0.5, color: colors.foreground },
    filters: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: spacing.lg + 2, paddingBottom: spacing.sm + 2 },
    filter: { height: 30, paddingHorizontal: 12, borderRadius: radius.round, backgroundColor: colors.secondary, justifyContent: "center" },
    filterOn: { backgroundColor: colors.foreground },
    filterText: { fontSize: typography.small + 0.5, fontWeight: "600", color: colors.mutedForeground },
    filterTextOn: { color: colors.background },
    list: { flexGrow: 0 },
    listContent: { paddingHorizontal: spacing.lg + 2, paddingBottom: spacing.md },
    sectionHead: { flexDirection: "row", justifyContent: "space-between", paddingTop: spacing.md, paddingBottom: 6, paddingHorizontal: 4 },
    sectionTitle: { fontSize: typography.tiny + 1, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", color: colors.mutedForeground },
    item: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingVertical: 11,
      paddingHorizontal: 4,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    itemIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center" },
    itemIconOn: { backgroundColor: colors.accent },
    itemLabel: { fontSize: typography.body + 0.5, fontWeight: "600", color: colors.foreground },
    itemLabelOn: { color: colors.primary },
    itemSub: { fontSize: typography.small, color: colors.mutedForeground },
    tag: {
      fontSize: typography.tiny + 0.5,
      fontWeight: "700",
      color: colors.mutedForeground,
      backgroundColor: colors.secondary,
      borderRadius: radius.round,
      paddingHorizontal: 8,
      paddingVertical: 3,
      overflow: "hidden",
    },
    radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
    radioOn: { borderColor: colors.primary, backgroundColor: colors.primary },
    empty: { alignItems: "center", paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg, gap: 6 },
    emptyTitle: { fontSize: typography.body + 1, fontWeight: "700", color: colors.foreground, textAlign: "center", marginTop: 4 },
    emptyText: { fontSize: typography.small + 0.5, color: colors.mutedForeground, textAlign: "center" },
    sheetFoot: { borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.lg, alignItems: "center" },
    footText: { fontSize: typography.small, color: colors.mutedForeground },
  }),
);
