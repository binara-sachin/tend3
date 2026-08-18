import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { firstSortKey, sortKeyAfter } from "../../../lib/sortKey.js";
import { useRedo, useRunCommand, useUndo } from "../queries/hooks.js";
import { useUiStore } from "../store/uiStore.js";

interface CachedRow {
  id: string;
  sortKey?: string;
  completedAt?: string | null;
}

/** Mounted once at the app root. Acts on the UI store's current activeSelection / focusedColumnParentId. */
export function useKeyboardShortcuts(): void {
  const queryClient = useQueryClient();
  const runCommand = useRunCommand();
  const undo = useUndo();
  const redo = useRedo();

  useEffect(() => {
    // "root" is the same string sentinel /api/columns/:parentId already
    // uses for the same concept (see server/app.ts) — the sidebar (the
    // only place a root-level item can be selected/focused from, since it
    // is never a Column) uses it too, so it has to be translated back to
    // the real API value of null wherever it reaches a query key or a
    // command payload.
    function toApiParentId(uiParentId: string): string | null {
      return uiParentId === "root" ? null : uiParentId;
    }

    function siblingsOf(targetParentId: string): CachedRow[] {
      return queryClient.getQueryData<CachedRow[]>(["columns", toApiParentId(targetParentId)]) ?? [];
    }

    function createNode(targetParentId: string) {
      const apiParentId = toApiParentId(targetParentId);
      // Invariant 3 (root nodes are always project): creating directly at
      // the root must produce a project, not a todo.
      const type: "project" | "todo" = apiParentId === null ? "project" : "todo";
      const lastSortKey = siblingsOf(targetParentId).at(-1)?.sortKey ?? null;
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
    }

    function onKeyDown(e: KeyboardEvent) {
      const { activeSelection: selection, focusedColumnParentId } = useUiStore.getState();

      if (e.key === " " && !e.metaKey) {
        if (!selection || selection.type !== "todo") return;
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
        if (!selection) return;
        e.preventDefault();
        runCommand.mutate({
          type: "TrashNode",
          payload: { nodeId: selection.nodeId },
          parentId: toApiParentId(selection.parentId),
        });
        return;
      }

      if (e.metaKey && e.key.toLowerCase() === "z") {
        const target = document.activeElement;
        const isTextField = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
        if (isTextField) return;
        e.preventDefault();
        if (e.shiftKey) {
          redo.mutate();
        } else {
          undo.mutate();
        }
        return;
      }

      if (e.metaKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        useUiStore.getState().setSearchOpen(true);
        return;
      }

      if (e.metaKey && e.key.toLowerCase() === "n") {
        if (e.shiftKey) {
          // Child inside the selected project — needs an actual project selected.
          if (!selection || selection.type !== "project") return;
          e.preventDefault();
          createNode(selection.nodeId);
          return;
        }

        // Sibling below the current selection, or — with nothing selected yet
        // (e.g. a freshly opened, empty column) — inside the focused column.
        const targetParentId = selection ? selection.parentId : focusedColumnParentId;
        if (!targetParentId) return;
        e.preventDefault();
        createNode(targetParentId);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [queryClient, runCommand, undo, redo]);
}
