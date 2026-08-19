import { useQueryClient } from "@tanstack/react-query";
import { firstSortKey, sortKeyAfter } from "../../../lib/sortKey.js";
import type { ColumnRow } from "../../../queries/getColumn.js";
import { useUiStore } from "../store/uiStore.js";
import { useRunCommand } from "./hooks.js";

/**
 * Starts the create flow for `targetParentId` — the UI-layer "root"/id
 * sentinel the sidebar and columns already use. This shows a blank inline
 * title input as the last row of that list (the same input rename uses);
 * nothing is created until that input is submitted with a non-blank title
 * — see useSubmitNewNode.
 */
export function useCreateNode() {
  const setCreatingParentId = useUiStore((s) => s.setCreatingParentId);
  return function createNode(targetParentId: string) {
    setCreatingParentId(targetParentId);
  };
}

/**
 * Fires the actual CreateNode command once the pending-create input (opened
 * by useCreateNode) is submitted. A blank (or whitespace-only) title is a
 * no-op — CreateNode itself would reject it too, but checking here avoids a
 * round-trip and leaves the input open for another attempt instead of
 * silently closing it. Root children must be projects (invariant 3);
 * everywhere else, a todo.
 */
export function useSubmitNewNode() {
  const queryClient = useQueryClient();
  const runCommand = useRunCommand();
  const setCreatingParentId = useUiStore((s) => s.setCreatingParentId);

  return function submitNewNode(targetParentId: string, title: string) {
    const trimmed = title.trim();
    if (trimmed === "") return;

    const apiParentId = targetParentId === "root" ? null : targetParentId;
    const type: "project" | "todo" = apiParentId === null ? "project" : "todo";
    const siblings = queryClient.getQueryData<ColumnRow[]>(["columns", apiParentId]) ?? [];
    const lastSortKey = siblings.at(-1)?.sortKey ?? null;
    runCommand.mutate({
      type: "CreateNode",
      payload: {
        parentId: apiParentId,
        type,
        title: trimmed,
        notes: "",
        sortKey: lastSortKey ? sortKeyAfter(lastSortKey) : firstSortKey(),
        whenDate: null,
        deadline: null,
      },
      parentId: apiParentId,
    });
    setCreatingParentId(null);
  };
}
