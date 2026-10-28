import { useCallback, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/Card";
import { listMyBookings, type StaffBooking } from "@/api/client";
import { addDays, bookingShifts, bookingTime, dateKey, dayHeading, groupByDay } from "@/domain/schedule";
import { useScheduleOn } from "@/features/schedule";
import { useSmartClean } from "@/features/store";
import { colors, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

/** The bookings on the next day this person is booked (within two weeks), or null while unknown or
 * when Staff scheduling is off. Shared by the booking card and the Today card. */
export function useUpcomingBooking(): StaffBooking[] | null {
  const { state } = useSmartClean();
  const on = useScheduleOn();
  const [next, setNext] = useState<StaffBooking[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!on || !state.accessToken) return;
      listMyBookings(state.accessToken, dateKey(new Date()), dateKey(addDays(new Date(), 14)))
        .then((rows) => setNext(groupByDay(rows)[0]?.items ?? []))
        .catch(() => setNext(null));
    }, [on, state.accessToken]),
  );

  return on ? next : null;
}

/** On the home screen: the next place and time the person is booked, and a way to the full schedule. */
export function UpcomingBookingCard() {
  useThemeVersion();
  const next = useUpcomingBooking();

  if (next === null) return null;
  const first = next[0];
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push("/schedule" as never)}>
      <Card style={styles.card}>
        <View style={styles.row}>
          <Ionicons name="calendar-outline" size={18} color={colors.primary} />
          <Text style={styles.heading}>Your next booking</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
        </View>
        {first ? (
          <>
            <Text style={styles.site}>{first.site.name}</Text>
            <Text style={styles.muted}>
              {dayHeading(first.date)} · {bookingTime(first)}
              {bookingShifts(first) !== "" ? ` (${bookingShifts(first)})` : ""}
              {next.length > 1 ? ` (+${next.length - 1} more that day)` : ""}
            </Text>
            {!!first.instructions && (
              <Text style={styles.muted} numberOfLines={2}>
                {first.instructions}
              </Text>
            )}
          </>
        ) : (
          <Text style={styles.muted}>You are not booked in the next two weeks.</Text>
        )}
      </Card>
    </Pressable>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    card: { gap: spacing.xs, marginBottom: spacing.md },
    row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    heading: { flex: 1, fontSize: typography.small, fontWeight: "700", color: colors.mutedForeground },
    site: { fontSize: typography.body, fontWeight: "800", color: colors.foreground },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
  }),
);
