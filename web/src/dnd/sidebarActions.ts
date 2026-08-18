import { sortKeyAfter } from "../../../lib/sortKey.js";
import type { ColumnRow } from "../../../queries/getColumn.js";

/** Sidebar smart lists are action targets, not move targets (spec 6): dropping on them
 * triggers a command rather than reparenting/reordering like a normal column drop. */
export const SIDEBAR_DROP_IDS = {
  today: "sidebar-today",
  inbox: "sidebar-inbox",
  trash: "sidebar-trash",
} as const;

/** Calendar date only, no time component (spec 3.1). */
export function todayDateString(now: Date): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export interface SidebarDropCommand {
  type: "SetWhen" | "MoveNode" | "TrashNode";
  payload: Record<string, unknown>;
}

export function resolveSidebarDrop(
  overId: string,
  nodeId: string,
  today: string,
  inbox?: { inboxId: string; inboxChildren: ColumnRow[] },
): SidebarDropCommand | null {
  switch (overId) {
    case SIDEBAR_DROP_IDS.today:
      return { type: "SetWhen", payload: { nodeId, whenDate: today } };
    case SIDEBAR_DROP_IDS.inbox: {
      if (!inbox) return null;
      const lastKey = inbox.inboxChildren.at(-1)?.sortKey ?? null;
      return {
        type: "MoveNode",
        payload: { nodeId, newParentId: inbox.inboxId, newSortKey: sortKeyAfter(lastKey) },
      };
    }
    case SIDEBAR_DROP_IDS.trash:
      return { type: "TrashNode", payload: { nodeId } };
    default:
      return null;
  }
}
