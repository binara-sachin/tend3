import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useState } from "react";
import { useColumn, useRunCommand } from "../queries/hooks.js";
import { useUiStore } from "../store/uiStore.js";
import type { ColumnRow } from "../../../queries/getColumn.js";

function columnKey(parentId: string | null): string {
  return parentId ?? "root";
}

interface RowProps {
  row: ColumnRow;
  parentKey: string;
  isRenaming: boolean;
  onStartRename(): void;
  onSubmitRename(title: string): void;
  onCancelRename(): void;
  onSelect(): void;
}

function Row({
  row,
  parentKey,
  isRenaming,
  onStartRename,
  onSubmitRename,
  onCancelRename,
  onSelect,
}: RowProps) {
  const { setNodeRef, attributes, listeners, transform, transition } = useSortable({
    id: row.id,
    data: { parentId: parentKey, sortKey: row.sortKey, type: row.type },
  });
  // Only project rows are valid "reparent into" whole-row targets; the ref
  // is simply never attached for other row types (see the JSX below), so
  // dnd-kit never registers/measures a droppable for them.
  const { setNodeRef: setWholeRowDropRef } = useDroppable({
    id: `project-drop-${row.id}`,
    data: { parentId: row.id, type: "whole-row" },
  });

  if (isRenaming) {
    return (
      // eslint-disable-next-line jsx-a11y/no-autofocus
      <input
        autoFocus
        defaultValue={row.title}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmitRename(e.currentTarget.value);
          else if (e.key === "Escape") onCancelRename();
        }}
      />
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, display: "flex" }}
    >
      <button type="button" aria-label={`Drag ${row.title}`} {...attributes} {...listeners}>
        ⠿
      </button>
      <div
        ref={row.type === "project" ? setWholeRowDropRef : undefined}
        role="button"
        tabIndex={0}
        data-row="true"
        data-droppable-id={row.type === "project" ? `project-drop-${row.id}` : undefined}
        style={{ minHeight: "1.4em" }}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onStartRename();
            return;
          }
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const list = e.currentTarget.closest("ul");
            if (!list) return;
            const items = Array.from(
              list.querySelectorAll(":scope > li [data-row]"),
            ) as HTMLElement[];
            const index = items.indexOf(e.currentTarget);
            const nextIndex = e.key === "ArrowDown" ? index + 1 : index - 1;
            items[nextIndex]?.focus();
            return;
          }
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            const column = e.currentTarget.closest("[data-depth]");
            const targetColumn =
              e.key === "ArrowRight" ? column?.nextElementSibling : column?.previousElementSibling;
            const targetRow = targetColumn?.querySelector("[data-row]") as HTMLElement | null;
            targetRow?.focus();
          }
        }}
      >
        {row.title}
      </div>
    </div>
  );
}

interface ColumnBodyProps {
  parentId: string | null;
  depth: number;
}

function ColumnBody({ parentId, depth }: ColumnBodyProps) {
  const { data: rows } = useColumn(parentId);
  const showCompleted = useUiStore((s) => s.showCompleted[columnKey(parentId)] ?? false);
  const select = useUiStore((s) => s.select);
  const setActiveSelection = useUiStore((s) => s.setActiveSelection);
  const runCommand = useRunCommand();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [expandedHeadings, setExpandedHeadings] = useState<Set<string>>(new Set());

  if (!rows) return null;

  const visibleRows = rows.filter((row) => showCompleted || row.completedAt === null);
  const parentKey = columnKey(parentId);

  function toggleHeading(id: string) {
    setExpandedHeadings((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submitRename(nodeId: string, title: string) {
    runCommand.mutate({
      type: "RenameNode",
      payload: { nodeId, title },
      parentId: parentKey,
    });
    setRenamingId(null);
  }

  return (
    <SortableContext items={visibleRows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
      <ul>
        {visibleRows.map((row) => (
          <li key={row.id}>
            <Row
              row={row}
              parentKey={parentKey}
              isRenaming={renamingId === row.id}
              onStartRename={() => setRenamingId(row.id)}
              onSubmitRename={(title) => submitRename(row.id, title)}
              onCancelRename={() => setRenamingId(null)}
              onSelect={() => {
                setActiveSelection({ parentId: parentKey, nodeId: row.id, type: row.type });
                if (row.type === "heading") {
                  toggleHeading(row.id);
                } else {
                  select(depth, { id: row.id, type: row.type });
                }
              }}
            />
            {row.type === "heading" && expandedHeadings.has(row.id) && (
              <ColumnBody parentId={row.id} depth={depth} />
            )}
          </li>
        ))}
      </ul>
    </SortableContext>
  );
}

export interface ColumnProps {
  parentId: string | null;
  depth: number;
}

export function Column({ parentId, depth }: ColumnProps) {
  const key = columnKey(parentId);
  const showCompleted = useUiStore((s) => s.showCompleted[key] ?? false);
  const toggleShowCompleted = useUiStore((s) => s.toggleShowCompleted);
  const setFocusedColumnParentId = useUiStore((s) => s.setFocusedColumnParentId);

  useEffect(() => {
    setFocusedColumnParentId(key);
  }, [key, setFocusedColumnParentId]);

  return (
    <div onClick={() => setFocusedColumnParentId(key)}>
      <button type="button" aria-pressed={showCompleted} onClick={() => toggleShowCompleted(key)}>
        Show completed
      </button>
      <ColumnBody parentId={parentId} depth={depth} />
    </div>
  );
}
