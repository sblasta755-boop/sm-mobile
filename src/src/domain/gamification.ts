// Wording for the points / streak / badge screens. Mirrored in the web app at
// smart-property-operations/src/src/lib/smartclean/gamification.ts - keep both in sync.

/** "1st", "2nd", "3rd", "4th", "11th", "22nd". */
export function ordinal(n: number): string {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** A person's own position, without anyone else's name: "3rd of 12", or why they have none. */
export function rankLabel(rank: number | null, of: number): string {
  if (rank === null) return "Not ranked yet - earn your first points";
  return `${ordinal(rank)} of ${of}`;
}

export const PERIOD_LABEL = { week: "This week", month: "This month" } as const;

/** Every badge, in the order a person is most likely to earn them, so locked ones can be shown. */
export const ALL_BADGES: { key: string; label: string; description: string }[] =
  [
    {
      key: "first_task",
      label: "First approved task",
      description: "Have a task approved by a reviewer.",
    },
    {
      key: "no_rework_10",
      label: "Clean run",
      description: "10 approved tasks in a row with no rework.",
    },
    {
      key: "streak_7",
      label: "Week streak",
      description: "Approved work with no rework on 7 days in a row.",
    },
    {
      key: "on_time_20",
      label: "Always on time",
      description: "20 approved tasks in a row submitted on time.",
    },
    {
      key: "streak_30",
      label: "Month streak",
      description: "Approved work with no rework on 30 days in a row.",
    },
    {
      key: "quality_star",
      label: "Quality star",
      description: "5 tasks with an inspection score of 95 or more.",
    },
  ];
