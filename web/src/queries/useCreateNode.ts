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
 * — see useSubmitNewNode. `type` overrides the default inference (a
 * project at root, a todo everywhere else) — e.g. a column header's
 * "new sub-project" button explicitly requests "project".
 */
export function useCreateNode() {
  const setCreatingParentId = useUiStore((s) => s.setCreatingParentId);
  return function createNode(targetParentId: string, type?: "project" | "todo") {
    setCreatingParentId(targetParentId, type);
  };
}

/**
 * Fires the actual CreateNode command once the pending-create input (opened
 * by useCreateNode) is submitted. A blank (or whitespace-only) title is a
 * no-op — CreateNode itself would reject it too, but checking here avoids a
 * round-trip and leaves the input open for another attempt instead of
 * silently closing it. Root children must be projects (invariant 3);
 * everywhere else, a todo, unless useCreateNode's caller requested a
 * sub-project explicitly (creatingType).
 */
export function useSubmitNewNode() {
  const queryClient = useQueryClient();
  const runCommand = useRunCommand();
  const setCreatingParentId = useUiStore((s) => s.setCreatingParentId);

  return function submitNewNode(targetParentId: string, title: string) {
    const trimmed = title.trim();
    if (trimmed === "") return;

    const apiParentId = targetParentId === "root" ? null : targetParentId;
    const creatingType = useUiStore.getState().creatingType;
    const type: "project" | "todo" = apiParentId === null ? "project" : (creatingType ?? "todo");
    const siblings = queryClient.getQueryData<ColumnRow[]>(["columns", apiParentId]) ?? [];
    const lastSortKey = siblings.at(-1)?.sortKey ?? null;

    let sortKey: string;
    try {
      sortKey = lastSortKey ? sortKeyAfter(lastSortKey) : firstSortKey();
    } catch (err) {
      // A corrupt last-sibling sortKey would otherwise throw here, before
      // the input is ever dismissed — leaving it permanently stuck open.
      setCreatingParentId(null);
      window.alert(`Couldn't create "${trimmed}": ${(err as Error).message}`);
      return;
    }

    runCommand.mutate(
      {
        type: "CreateNode",
        payload: {
          parentId: apiParentId,
          type,
          title: trimmed,
          notes: "",
          sortKey,
          whenDate: null,
          deadline: null,
        },
        parentId: apiParentId,
      },
      {
        // A command the server rejects (e.g. a sortKey collision) would
        // otherwise fail with no trace anywhere in the UI — it just looks
        // like nothing happened, and the input has already closed by now.
        onError: (err) => window.alert(`Couldn't create "${trimmed}": ${(err as Error).message}`),
      },
    );
    setCreatingParentId(null);
  };
}
