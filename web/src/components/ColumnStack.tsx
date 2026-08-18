import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useRef, useState } from "react";
import type { ColumnRow } from "../../../queries/getColumn.js";
import { resolveSameColumnReorder } from "../dnd/resolveMove.js";
import { useRunCommand } from "../queries/hooks.js";
import { useUiStore } from "../store/uiStore.js";
import { Column } from "./Column.js";
import { queryClient } from "../queries/queryClient.js";

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

interface SortableItemData {
  parentId: string;
  sortKey: string;
  type: "project" | "heading" | "todo";
}

export function ColumnStack() {
  const openPath = useUiStore((s) => s.openPath);
  const columnWidths = useUiStore((s) => s.columnWidths);
  const setColumnWidth = useUiStore((s) => s.setColumnWidth);
  const runCommand = useRunCommand();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current as SortableItemData | undefined;
    const overData = over.data.current as SortableItemData | undefined;
    if (!activeData || !overData) return; // dropped somewhere without item data (not yet handled — Task 4/5)

    // This task only handles reordering within the same column; cross-column
    // reparenting and whole-row "drop into project" land in the next task.
    const siblings = queryClient.getQueryData<ColumnRow[]>(["columns", overData.parentId]) ?? [];
    const resolved = resolveSameColumnReorder(
      String(active.id),
      String(over.id),
      activeData.parentId,
      overData.parentId,
      siblings,
    );
    if (!resolved) return;

    runCommand.mutate({
      type: "MoveNode",
      payload: { nodeId: resolved.nodeId, newParentId: resolved.newParentId, newSortKey: resolved.newSortKey },
      parentId: resolved.parentId,
    });
  }

  // The sidebar renders depth 0 of the tree (spec §1) and calls select(0, ...)
  // to start the open path, so the stack's first rendered column (children
  // of that first selection) must itself select at depth 1 to EXTEND the
  // path rather than overwrite it — hence index + 1 below, not index.
  const projectIds = openPath.filter((e) => e.type === "project").map((e) => e.id);

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div style={{ display: "flex" }}>
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
    </DndContext>
  );
}
