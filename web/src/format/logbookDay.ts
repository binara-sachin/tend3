import { MONTH_NAMES, WEEKDAY_NAMES, daysBetween, toUtcDate } from "./dueBadge.js";

/** The group-header label for a Logbook day (spec 6): "Today", "Yesterday", or e.g. "Mon, Aug 10". */
export function formatLogbookDay(day: string, today: string): string {
  const diff = daysBetween(day, today);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  const [, , d] = day.split("-").map(Number);
  const date = toUtcDate(day);
  return `${WEEKDAY_NAMES[date.getUTCDay()]}, ${MONTH_NAMES[date.getUTCMonth()]} ${d}`;
}
