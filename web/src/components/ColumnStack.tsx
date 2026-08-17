import { useRef, useState } from "react";
import { useUiStore } from "../store/uiStore.js";
import { Column } from "./Column.js";

const DEFAULT_WIDTH = 280;

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
      <div style={{ flex: 1, overflow: "auto" }}>{children}</div>
      <div
        role="separator"
        aria-orientation="vertical"
        onPointerDown={onPointerDown}
        style={{ width: 4, cursor: "col-resize" }}
      />
    </div>
  );
}

export function ColumnStack() {
  const openPath = useUiStore((s) => s.openPath);
  const columnWidths = useUiStore((s) => s.columnWidths);
  const setColumnWidth = useUiStore((s) => s.setColumnWidth);

  const projectIds = openPath.filter((e) => e.type === "project").map((e) => e.id);
  const parentIdsByDepth: Array<string | null> = [null, ...projectIds];

  return (
    <div style={{ display: "flex" }}>
      {parentIdsByDepth.map((parentId, depth) => (
        <ResizableColumn
          key={parentId ?? "root"}
          depth={depth}
          width={columnWidths[depth] ?? DEFAULT_WIDTH}
          onResize={(w) => setColumnWidth(depth, w)}
        >
          <Column parentId={parentId} depth={depth} />
        </ResizableColumn>
      ))}
    </div>
  );
}
