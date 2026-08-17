import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { firstSortKey, sortKeyAfter } from "../../../lib/sortKey.js";
import { useRunCommand } from "../queries/hooks.js";
import { useUiStore } from "../store/uiStore.js";

interface CachedRow {
  id: string;
  sortKey?: string;
  completedAt?: string | null;
}

/** Mounted once at the app root. Acts on the UI store's current activeSelection. */
export function useKeyboardShortcuts(): void {
  const queryClient = useQueryClient();
  const runCommand = useRunCommand();

  useEffect(() => {
    function siblingsOf(parentId: string): CachedRow[] {
      return queryClient.getQueryData<CachedRow[]>(["columns", parentId]) ?? [];
    }

    function onKeyDown(e: KeyboardEvent) {
      const selection = useUiStore.getState().activeSelection;
      if (!selection) return;

      if (e.key === " " && !e.metaKey) {
        if (selection.type !== "todo") return;
        e.preventDefault();
        const current = siblingsOf(selection.parentId).find((r) => r.id === selection.nodeId);
        runCommand.mutate({
          type: "SetCompleted",
          payload: { nodeId: selection.nodeId, completed: current?.completedAt == null },
          parentId: selection.parentId,
        });
        return;
      }

      if (e.metaKey && e.key === "Backspace") {
        e.preventDefault();
        runCommand.mutate({
          type: "TrashNode",
          payload: { nodeId: selection.nodeId },
          parentId: selection.parentId,
        });
        return;
      }

      if (e.metaKey && e.key.toLowerCase() === "n") {
        if (e.shiftKey && selection.type !== "project") return;
        e.preventDefault();

        const targetParentId = e.shiftKey ? selection.nodeId : selection.parentId;
        const lastSortKey = siblingsOf(targetParentId).at(-1)?.sortKey ?? null;

        runCommand.mutate({
          type: "CreateNode",
          payload: {
            parentId: targetParentId,
            type: "todo",
            title: "",
            notes: "",
            sortKey: lastSortKey ? sortKeyAfter(lastSortKey) : firstSortKey(),
            whenDate: null,
            deadline: null,
          },
          parentId: targetParentId,
        });
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [queryClient, runCommand]);
}
