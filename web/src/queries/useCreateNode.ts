import { useQueryClient } from "@tanstack/react-query";
import { firstSortKey, sortKeyAfter } from "../../../lib/sortKey.js";
import type { ColumnRow } from "../../../queries/getColumn.js";
import { useRunCommand } from "./hooks.js";

/**
 * Creates a new blank-titled node as the last child of `targetParentId` —
 * the UI-layer string sentinel ("root" or a real node id) the sidebar and
 * columns already use. Root children must be projects (invariant 3);
 * everywhere else, a todo.
 */
export function useCreateNode() {
  const queryClient = useQueryClient();
  const runCommand = useRunCommand();

  return function createNode(targetParentId: string) {
    const apiParentId = targetParentId === "root" ? null : targetParentId;
    const type: "project" | "todo" = apiParentId === null ? "project" : "todo";
    const siblings = queryClient.getQueryData<ColumnRow[]>(["columns", apiParentId]) ?? [];
    const lastSortKey = siblings.at(-1)?.sortKey ?? null;
    runCommand.mutate({
      type: "CreateNode",
      payload: {
        parentId: apiParentId,
        type,
        title: "",
        notes: "",
        sortKey: lastSortKey ? sortKeyAfter(lastSortKey) : firstSortKey(),
        whenDate: null,
        deadline: null,
      },
      parentId: apiParentId,
    });
  };
}
