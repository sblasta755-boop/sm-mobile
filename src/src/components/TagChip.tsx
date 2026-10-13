import { StyleSheet, Text, View } from "react-native";
import { useSmartClean } from "@/features/store";
import { tagStyle } from "@/domain/tagColors";
import { radius, themedStyles, typography } from "@/theme";

/** A task tag drawn in its colour: the organisation's choice, else one from its name. */
export function TagChip({ tag }: { tag: string }) {
  const { state } = useSmartClean();
  const style = tagStyle(tag, state.tagColors);
  return (
    <View style={[styles.chip, { backgroundColor: style.backgroundColor, borderColor: style.borderColor }]}>
      <Text style={[styles.text, { color: style.color }]} numberOfLines={1}>
        {tag}
      </Text>
    </View>
  );
}

/** A row of tag chips, capped so a long list does not crowd the card. */
export function TagChips({ tags, max = 3 }: { tags?: string[]; max?: number }) {
  if (!tags || tags.length === 0) return null;
  const shown = tags.slice(0, max);
  return (
    <View style={styles.row}>
      {shown.map((tag) => (
        <TagChip key={tag} tag={tag} />
      ))}
      {tags.length > max && <Text style={styles.more}>+{tags.length - max}</Text>}
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
    chip: { borderWidth: 1, borderRadius: radius.round, paddingHorizontal: 8, paddingVertical: 2, maxWidth: 140 },
    text: { fontSize: typography.tiny, fontWeight: "700", letterSpacing: 0.3 },
    more: { fontSize: typography.tiny, fontWeight: "700", opacity: 0.6 },
  }),
);
