import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useState, type ReactNode } from "react";
import { INBOX_ID } from "../../../db/constants.js";
import type { ColumnRow } from "../../../queries/getColumn.js";
import { useRunCommand } from "../queries/hooks.js";
import { queryClient } from "../queries/queryClient.js";
import { CircleIcon, FolderIcon } from "../icons.js";
import {
  resolveCrossColumnInsertion,
  resolveInsertSide,
  resolveSameColumnReorder,
  resolveWholeRowDrop,
} from "./resolveMove.js";
import { resolveSidebarDrop, todayDateString } from "./sidebarActions.js";

const WHOLE_ROW_DROP_PREFIX = "project-drop-";

// The UI-layer "root" sentinel (also used in sortable item data for the
// sidebar's root-level project list) isn't a real cache key — the column
// cache is keyed by the actual API parentId, null for root.
function toApiParentId(uiParentId: string): string | null {
  return uiParentId === "root" ? null : uiParentId;
}

/**
 * Prioritizes a whole-row "drop into project" target whenever the pointer is
 * literally within its bounds; falls back to the sortable list's own
 * closest-center insertion-line detection otherwise. This disambiguation is
 * spec 6.1's "highest risk in the project" callout.
 */
const collisionDetectionStrategy: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  const wholeRowHit = pointerCollisions.find((c) => String(c.id).startsWith(WHOLE_ROW_DROP_PREFIX));
  if (wholeRowHit) return [wholeRowHit];
  return closestCenter(args);
};

interface SortableItemData {
  parentId: string;
  sortKey: string;
  type: "project" | "heading" | "todo";
  title: string;
}

/**
 * Wraps the sidebar and column stack in one shared DndContext — dragging
 * across them (e.g. onto a sidebar smart list) requires a single context
 * spanning both, not one scoped to the column stack alone.
 */
export function DragProvider({ children }: { children: ReactNode }) {
  const runCommand = useRunCommand();
  const [activeItem, setActiveItem] = useState<SortableItemData | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveItem((event.active.data.current as SortableItemData | undefined) ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveItem(null);
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current as SortableItemData | undefined;
    if (!activeData) return;
    const nodeId = String(active.id);
    const overIdStr = String(over.id);

    const sidebarCommand = resolveSidebarDrop(overIdStr, nodeId, todayDateString(new Date()), {
      inboxId: INBOX_ID,
      inboxChildren: queryClient.getQueryData<ColumnRow[]>(["columns", INBOX_ID]) ?? [],
    });
    if (sidebarCommand) {
      runCommand.mutate({
        type: sidebarCommand.type,
        payload: sidebarCommand.payload,
        parentId: toApiParentId(activeData.parentId),
      });
      return;
    }

    if (overIdStr.startsWith(WHOLE_ROW_DROP_PREFIX)) {
      const targetProjectId = overIdStr.slice(WHOLE_ROW_DROP_PREFIX.length);
      if (targetProjectId === nodeId) return; // can't drop a project into itself
      const targetChildren = queryClient.getQueryData<ColumnRow[]>(["columns", targetProjectId]) ?? [];
      const resolved = resolveWholeRowDrop(targetProjectId, targetChildren);
      runCommand.mutate({
        type: "MoveNode",
        payload: { nodeId, newParentId: resolved.newParentId, newSortKey: resolved.newSortKey },
        parentId: toApiParentId(resolved.parentId),
      });
      return;
    }

    const overData = over.data.current as SortableItemData | undefined;
    if (!overData) return;

    if (activeData.parentId === overData.parentId) {
      const siblings =
        queryClient.getQueryData<ColumnRow[]>(["columns", toApiParentId(overData.parentId)]) ?? [];
      const resolved = resolveSameColumnReorder(
        nodeId,
        overIdStr,
        activeData.parentId,
        overData.parentId,
        siblings,
      );
      if (!resolved) return;
      runCommand.mutate({
        type: "MoveNode",
        payload: { nodeId, newParentId: resolved.newParentId, newSortKey: resolved.newSortKey },
        parentId: toApiParentId(resolved.parentId),
      });
      return;
    }

    // Cross-column: active isn't yet among `over`'s siblings, so which side of
    // `over` it lands on has to come from the drag's actual measured rects.
    const activeRect = active.rect.current.translated ?? active.rect.current.initial;
    if (!activeRect) return;
    const side = resolveInsertSide(
      activeRect.top + activeRect.height / 2,
      over.rect.top,
      over.rect.height,
    );
    const siblings =
      queryClient.getQueryData<ColumnRow[]>(["columns", toApiParentId(overData.parentId)]) ?? [];
    const resolved = resolveCrossColumnInsertion(overIdStr, overData.parentId, side, siblings);
    if (!resolved) return;

    runCommand.mutate({
      type: "MoveNode",
      payload: { nodeId, newParentId: resolved.newParentId, newSortKey: resolved.newSortKey },
      parentId: toApiParentId(resolved.parentId),
    });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetectionStrategy}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveItem(null)}
    >
      {children}
      <DragOverlay>
        {activeItem && (
          <div className="drag-overlay-row">
            <span className="row-icon">
              {activeItem.type === "project" ? <FolderIcon size={15} /> : <CircleIcon size={16} />}
            </span>
            <span className="row-title">{activeItem.title}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
