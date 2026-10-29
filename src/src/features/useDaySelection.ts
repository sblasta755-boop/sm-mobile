import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { startOfDay } from "@/components/DateStrip";
import { useNow } from "@/features/useNow";

/**
 * Today, and the day being looked at. A tab screen stays mounted while the app sits in the background,
 * so a "today" captured when it first opened goes stale overnight, and a day picked on the strip stays
 * picked. Here today is recomputed, and the picked day goes back to today, whenever the screen comes into
 * view and when midnight passes.
 */
export function useDaySelection() {
  const [today, setToday] = useState(() => startOfDay(new Date()));
  const [selected, setSelected] = useState(today);

  useFocusEffect(
    useCallback(() => {
      const fresh = startOfDay(new Date());
      setToday(fresh);
      setSelected(fresh);
    }, []),
  );

  // Midnight while the screen is open: move on to the new day.
  const now = useNow();
  useEffect(() => {
    const fresh = startOfDay(new Date(now));
    if (fresh.getTime() !== today.getTime()) {
      setToday(fresh);
      setSelected(fresh);
    }
  }, [now, today]);

  return { today, selectedDate: selected, setSelectedDate: setSelected };
}
