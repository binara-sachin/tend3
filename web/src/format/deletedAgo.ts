import { daysBetween } from "./dueBadge.js";

/** The "Deleted N ago" caption on a Trash row (spec 6). `deletedAt` is a full timestamp; only its calendar day matters. */
export function formatDeletedAgo(deletedAt: string, today: string): string {
  const diff = daysBetween(deletedAt.slice(0, 10), today);
  if (diff === 0) return "Deleted today";
  if (diff === 1) return "Deleted yesterday";
  return `Deleted ${diff} days ago`;
}
