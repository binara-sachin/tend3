import { useEffect } from "react";
import { useRedo, useRunCommand, useUndo } from "../queries/hooks.js";
import { useCreateNode } from "../queries/useCreateNode.js";
import { useUiStore } from "../store/uiStore.js";

/** Mounted once at the app root. Acts on the UI store's current activeSelection / focusedColumnParentId. */
export function useKeyboardShortcuts(): void {
  const runCommand = useRunCommand();
  const undo = useUndo();
  const redo = useRedo();
  const createNode = useCreateNode();

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

    function onKeyDown(e: KeyboardEvent) {
      const { activeSelection: selection, focusedColumnParentId } = useUiStore.getState();
      const target = document.activeElement;
      const isTextField = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

      // Cmd+Backspace's meta+Backspace is macOS's native delete-to-line-start
      // in a text field — never let it fall through to the row-level trash
      // shortcut below while typing.
      if (isTextField && e.metaKey && e.key === "Backspace") {
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
  }, [runCommand, undo, redo, createNode]);
}
