import { useEffect, useState } from "react";
import { useUiStore } from "../store/uiStore.js";
import { DetailPane } from "./DetailPane.js";

// Matches .detail-pane's slide-out animation duration (app.css) — the pane
// stays mounted this long after deselection so the exit animation can play,
// instead of vanishing the instant the selection clears.
const CLOSE_ANIMATION_MS = 180;

/**
 * Owns the detail pane's mount lifecycle so it can animate out before being
 * removed: the store clears the todo selection immediately (openPath
 * shrinks right away, so column-stack/keyboard-shortcut state is correct
 * without delay), but this component keeps rendering <DetailPane> a little
 * longer, with a closing class, until the exit animation finishes.
 *
 * Also owns the "click outside dismisses it" listener, since that's this
 * component's lifecycle to trigger. Clicks on a row or any button are
 * deliberately excluded — those already change the selection themselves
 * (e.g. picking a different todo just swaps this component's content in
 * place, no close-then-reopen), and treating them as "outside" too would
 * clear the selection right after the row's own click just set it.
 */
export function DetailPaneHost() {
  const openPath = useUiStore((s) => s.openPath);
  const activeSmartList = useUiStore((s) => s.activeSmartList);
  const deselectTodo = useUiStore((s) => s.deselectTodo);
  const lastEntry = openPath.at(-1);
  const lastProjectEntry = [...openPath].reverse().find((e) => e.type === "project");
  const isTodoSelected = activeSmartList === null && lastEntry?.type === "todo";

  const [rendered, setRendered] = useState<{ nodeId: string; parentId: string } | null>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (isTodoSelected && lastEntry) {
      setClosing(false);
      setRendered({ nodeId: lastEntry.id, parentId: lastProjectEntry?.id ?? "root" });
      return;
    }
    if (rendered) {
      setClosing(true);
      const timeout = setTimeout(() => setRendered(null), CLOSE_ANIMATION_MS);
      return () => clearTimeout(timeout);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTodoSelected, lastEntry?.id, lastProjectEntry?.id]);

  useEffect(() => {
    if (!rendered) return;

    function onPointerDown(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (target.closest(".detail-pane, [data-row], [role='button'], button")) return;
      deselectTodo();
    }

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [rendered, deselectTodo]);

  if (!rendered) return null;
  return <DetailPane nodeId={rendered.nodeId} parentId={rendered.parentId} closing={closing} />;
}
