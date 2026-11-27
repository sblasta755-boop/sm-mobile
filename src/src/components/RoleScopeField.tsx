import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fuzzyFilter } from "@/domain/fuzzySearch";
import { ALL_ROLES_SCOPE, levelOf, withLevel, type RoleLevel, type RoleScope } from "@/domain/roleScope";
import { colors, radius, spacing, themedStyles, typography } from "@/theme";

const MODES = [
  { mode: "all" as const, title: "All roles", hint: "Books anyone at this site." },
  { mode: "roles" as const, title: "Only chosen roles", hint: "Sees and books just the roles you pick." },
];
const LEVELS: { level: RoleLevel; label: string }[] = [
  { level: "primary", label: "Looks after" },
  { level: "extra", label: "Also" },
  { level: "none", label: "No" },
];
/** More roles than this and the list gets a search box. */
const SEARCH_FROM = 8;

/** Which staff roles a site manager or supervisor books at their site: every role, or chosen roles they look after
 * plus roles they may also book. Saved on its own (setRoleScope). Matches the web RoleScopeEditor. */
export function RoleScopeField({
  roles,
  value,
  onChange,
}: {
  roles: { key: string; label: string }[];
  value: RoleScope;
  onChange: (next: RoleScope) => void;
}) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => fuzzyFilter(roles, query, (r) => [r.label, r.key]), [roles, query]);
  return (
    <View style={styles.wrap}>
      <View accessibilityRole="radiogroup" style={styles.wrap}>
        {MODES.map((m) => {
          const on = value.mode === m.mode;
          return (
            <Pressable
              key={m.mode}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => onChange(m.mode === "all" ? ALL_ROLES_SCOPE : { ...value, mode: "roles" })}
              style={[styles.mode, on && styles.modeOn]}
            >
              <Ionicons name={on ? "radio-button-on" : "radio-button-off"} size={20} color={on ? colors.primary : colors.mutedForeground} />
              <View style={styles.flex}>
                <Text style={styles.title}>{m.title}</Text>
                <Text style={styles.muted}>{m.hint}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      {value.mode === "roles" && (
        <View style={styles.wrap}>
          <Text style={styles.muted}>
            Looks after shows by default. Also appears when they ask for other roles. {value.roles.length} looks after, {value.extraRoles.length} also.
          </Text>
          {roles.length > SEARCH_FROM && (
            <View style={styles.search}>
              <Ionicons name="search" size={16} color={colors.mutedForeground} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search roles"
                placeholderTextColor={colors.mutedForeground}
                autoCorrect={false}
                autoCapitalize="none"
                accessibilityLabel="Search roles"
                style={styles.searchInput}
              />
            </View>
          )}
          <ScrollView style={styles.list} nestedScrollEnabled contentContainerStyle={styles.wrap}>
            {shown.map((role) => {
              const current = levelOf(value, role.key);
              return (
                <View key={role.key} style={[styles.row, current !== "none" && styles.rowOn]}>
                  <Text style={styles.roleName} numberOfLines={1}>
                    {role.label}
                  </Text>
                  <View accessibilityRole="radiogroup" style={styles.seg}>
                    {LEVELS.map((l) => (
                      <Pressable
                        key={l.level}
                        accessibilityRole="radio"
                        accessibilityLabel={`${role.label}: ${l.level === "primary" ? "looks after" : l.level === "extra" ? "can also book" : "not theirs"}`}
                        accessibilityState={{ checked: current === l.level }}
                        onPress={() => onChange(withLevel(value, role.key, l.level))}
                        style={[styles.segItem, current === l.level && (l.level === "none" ? styles.segNone : styles.segOn)]}
                      >
                        <Text style={[styles.segText, current === l.level && l.level !== "none" && styles.segTextOn]}>{l.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              );
            })}
            {shown.length === 0 && <Text style={styles.muted}>No role matches &quot;{query}&quot;.</Text>}
          </ScrollView>
          {value.roles.length === 0 && <Text style={styles.muted}>Pick at least one role they look after to save.</Text>}
        </View>
      )}
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    wrap: { gap: spacing.sm },
    flex: { flex: 1 },
    mode: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, minHeight: 56 },
    modeOn: { borderColor: colors.primary, backgroundColor: colors.card },
    title: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    muted: { fontSize: typography.small + 1, color: colors.mutedForeground },
    search: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md, minHeight: 44 },
    searchInput: { flex: 1, fontSize: typography.body, color: colors.foreground },
    list: { maxHeight: 360 },
    row: { gap: spacing.xs, padding: spacing.sm, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
    rowOn: { borderColor: colors.primary },
    roleName: { fontSize: typography.body, fontWeight: "600", color: colors.foreground },
    seg: { flexDirection: "row", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 2, gap: 2 },
    segItem: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.md },
    segOn: { backgroundColor: colors.primary },
    segNone: { backgroundColor: colors.card },
    segText: { fontSize: typography.small + 1, fontWeight: "600", color: colors.mutedForeground },
    segTextOn: { color: colors.primaryForeground },
  }),
);
