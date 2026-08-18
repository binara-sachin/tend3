import { useRef, useState } from "react";
import { useUiStore } from "../store/uiStore.js";
import { Column } from "./Column.js";

const DEFAULT_WIDTH = 320;

interface ResizableColumnProps {
  depth: number;
  width: number;
  onResize(width: number): void;
  children: React.ReactNode;
}

function ResizableColumn({ depth, width, onResize, children }: ResizableColumnProps) {
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);
  const [liveWidth, setLiveWidth] = useState<number | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    dragState.current = { startX: e.clientX, startWidth: width };

    function onMove(ev: PointerEvent) {
      if (!dragState.current) return;
      setLiveWidth(dragState.current.startWidth + (ev.clientX - dragState.current.startX));
    }
    function onUp(ev: PointerEvent) {
      if (dragState.current) {
        onResize(dragState.current.startWidth + (ev.clientX - dragState.current.startX));
      }
      dragState.current = null;
      setLiveWidth(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div
      data-depth={depth}
      style={{ width: liveWidth ?? width, flexShrink: 0, display: "flex" }}
    >
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {children}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        onPointerDown={onPointerDown}
        style={{ width: 4, cursor: "col-resize", flex: "none" }}
      />
    </div>
  );
}

export function ColumnStack() {
  const openPath = useUiStore((s) => s.openPath);
  const columnWidths = useUiStore((s) => s.columnWidths);
  const setColumnWidth = useUiStore((s) => s.setColumnWidth);

  // The sidebar renders depth 0 of the tree (spec §1) and calls select(0, ...)
  // to start the open path, so the stack's first rendered column (children
  // of that first selection) must itself select at depth 1 to EXTEND the
  // path rather than overwrite it — hence index + 1 below, not index.
  const projectIds = openPath.filter((e) => e.type === "project").map((e) => e.id);

  return (
    <div className="column-stack">
      {projectIds.map((parentId, index) => {
        const depth = index + 1;
        return (
          <ResizableColumn
            key={parentId}
            depth={depth}
            width={columnWidths[depth] ?? DEFAULT_WIDTH}
            onResize={(w) => setColumnWidth(depth, w)}
          >
            <Column parentId={parentId} depth={depth} />
          </ResizableColumn>
        );
      })}
    </div>
  );
}
