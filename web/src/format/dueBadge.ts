export interface DueBadge {
  text: string;
  tone: "accent" | "neutral";
}

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function toUtcDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

/** Calendar days from `a` to `b` (positive when `b` is later). */
function daysBetween(a: string, b: string): number {
  return Math.round((toUtcDate(b).getTime() - toUtcDate(a).getTime()) / 86_400_000);
}

function weekdayName(dateStr: string): string {
  return WEEKDAY_NAMES[toUtcDate(dateStr).getUTCDay()]!;
}

function shortDate(dateStr: string): string {
  const [, m, d] = dateStr.split("-").map(Number);
  return `${MONTH_NAMES[m! - 1]} ${d}`;
}

function relativePast(days: number): string {
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/** The when-only badge shown on a column row (spec 4). */
export function formatColumnDueBadge(whenDate: string | null, today: string): DueBadge | null {
  if (whenDate === null) return null;
  const diff = daysBetween(today, whenDate);
  if (diff === 0) return { text: "Today", tone: "accent" };
  if (diff === 1) return { text: "Tomorrow", tone: "neutral" };
  if (diff > 1 && diff <= 6) return { text: weekdayName(whenDate), tone: "neutral" };
  return { text: shortDate(whenDate), tone: "neutral" };
}

/**
 * The deadline-first badge shown on a Today smart-list row. Every row Today
 * surfaces satisfies whenDate <= today OR deadline <= today (getTodayCandidates),
 * so this always has a badge to show.
 */
export function formatTodayBadge(
  whenDate: string | null,
  deadline: string | null,
  today: string,
): DueBadge {
  if (deadline !== null) {
    const overdueBy = daysBetween(deadline, today);
    if (overdueBy > 0) {
      return { text: `Overdue · deadline ${relativePast(overdueBy)}`, tone: "accent" };
    }
    if (overdueBy === 0) return { text: "Deadline today", tone: "neutral" };
  }
  if (whenDate !== null) {
    const overdueBy = daysBetween(whenDate, today);
    if (overdueBy > 0) return { text: "Overdue", tone: "accent" };
    if (overdueBy === 0) return { text: "When: today", tone: "neutral" };
  }
  return { text: "Deadline today", tone: "neutral" };
}
