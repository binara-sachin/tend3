import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useState } from "react";
import { useColumn, useNode, useRunCommand } from "../queries/hooks.js";
import { useCreateNode, useSubmitNewNode } from "../queries/useCreateNode.js";
import { useUiStore } from "../store/uiStore.js";
import type { ColumnRow } from "../../../queries/getColumn.js";
import { formatColumnDueBadge } from "../format/dueBadge.js";
import { todayDateString } from "../dnd/sidebarActions.js";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleIcon,
  DocumentIcon,
  DragHandleIcon,
  FolderIcon,
  PlusIcon,
} from "../icons.js";

function columnKey(parentId: string | null): string {
  return parentId ?? "root";
}

interface RowProps {
  row: ColumnRow;
  parentKey: string;
  isExpanded: boolean;
  isNested: boolean;
  isRenaming: boolean;
  onStartRename(): void;
  onSubmitRename(title: string): void;
  onCancelRename(): void;
  onSelect(): void;
}

function Row({
  row,
  parentKey,
  isExpanded,
  isNested,
  isRenaming,
  onStartRename,
  onSubmitRename,
  onCancelRename,
  onSelect,
}: RowProps) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging, isOver } =
    useSortable({
      id: row.id,
      data: { parentId: parentKey, sortKey: row.sortKey, type: row.type, title: row.title },
    });
  // Only project rows are valid "reparent into" whole-row targets; the ref
  // is simply never attached for other row types (see the JSX below), so
  // dnd-kit never registers/measures a droppable for them.
  const { setNodeRef: setWholeRowDropRef, isOver: isWholeRowOver } = useDroppable({
    id: `project-drop-${row.id}`,
    data: { parentId: row.id, type: "whole-row" },
  });

  if (isRenaming) {
    return (
      // eslint-disable-next-line jsx-a11y/no-autofocus
      <input
        autoFocus
        className="row-rename-input"
        defaultValue={row.title}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const title = e.currentTarget.value.trim();
            // A blank title is rejected server-side too, but checking here
            // avoids the round-trip and keeps the input open to try again
            // instead of silently discarding the edit.
            if (title === "") return;
            onSubmitRename(title);
          } else if (e.key === "Escape") {
            onCancelRename();
          }
        }}
      />
    );
  }

  const badge = row.type === "todo" ? formatColumnDueBadge(row.whenDate, todayDateString(new Date())) : null;

  return (
    <>
      {isOver && !isDragging && <div className="drop-indicator" />}
      <div
        ref={setNodeRef}
        className={`row${isNested && row.type !== "heading" ? " row--nested" : ""}${isDragging ? " row--dragging" : ""}`}
        style={{ transform: CSS.Transform.toString(transform), transition }}
      >
      <button
        type="button"
        className="row-drag-handle"
        aria-label={`Drag ${row.title}`}
        {...attributes}
        {...listeners}
      >
        <DragHandleIcon />
      </button>
      <div
        ref={row.type === "project" ? setWholeRowDropRef : undefined}
        role="button"
        tabIndex={0}
        data-row="true"
        data-droppable-id={row.type === "project" ? `project-drop-${row.id}` : undefined}
        className={`row-main${row.type === "heading" ? " row-main--heading" : ""}${isWholeRowOver ? " row-main--drop-target" : ""}`}
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
        {row.type === "heading" ? (
          <span className="row-icon">
            {isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
          </span>
        ) : (
          <span className="row-icon">
            {row.type === "project" ? (
              <FolderIcon size={15} />
            ) : row.completedAt !== null ? (
              <CheckCircleIcon size={16} />
            ) : (
              <CircleIcon size={16} />
            )}
          </span>
        )}
        {row.title}
        {row.type === "todo" && row.hasNotes && (
          <span className="row-notes-icon" title="Has notes">
            <DocumentIcon />
          </span>
        )}
        {badge && <span className={`badge badge--${badge.tone}`}>{badge.text}</span>}
        {row.type === "project" && (
          <span className="row-icon row-icon--muted">
            <ChevronRightIcon />
          </span>
        )}
      </div>
      </div>
    </>
  );
}

function NewItemRow({ parentKey }: { parentKey: string }) {
  const submitNewNode = useSubmitNewNode();
  const setCreatingParentId = useUiStore((s) => s.setCreatingParentId);

  return (
    <li>
      {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
      <input
        autoFocus
        className="row-rename-input"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            submitNewNode(parentKey, e.currentTarget.value);
          } else if (e.key === "Escape") {
            setCreatingParentId(null);
          }
        }}
      />
    </li>
  );
}

interface ColumnBodyProps {
  parentId: string | null;
  depth: number;
  nested?: boolean;
}

function ColumnBody({ parentId, depth, nested = false }: ColumnBodyProps) {
  const { data: rows } = useColumn(parentId);
  const showCompleted = useUiStore((s) => s.showCompleted[columnKey(parentId)] ?? false);
  const select = useUiStore((s) => s.select);
  const setActiveSelection = useUiStore((s) => s.setActiveSelection);
  const expandedHeadings = useUiStore((s) => s.expandedHeadings);
  const setHeadingExpanded = useUiStore((s) => s.setHeadingExpanded);
  const creatingParentId = useUiStore((s) => s.creatingParentId);
  const runCommand = useRunCommand();
  const [renamingId, setRenamingId] = useState<string | null>(null);

  if (!rows) return null;

  const visibleRows = rows.filter((row) => showCompleted || row.completedAt === null);
  const parentKey = columnKey(parentId);

  function toggleHeading(id: string) {
    setHeadingExpanded(id, !expandedHeadings[id]);
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
      <ul className="list-reset">
        {visibleRows.map((row) => (
          <li key={row.id}>
            <Row
              row={row}
              parentKey={parentKey}
              isExpanded={!!expandedHeadings[row.id]}
              isNested={nested}
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
            {row.type === "heading" && expandedHeadings[row.id] && (
              <ColumnBody parentId={row.id} depth={depth} nested />
            )}
          </li>
        ))}
        {creatingParentId === parentKey && <NewItemRow parentKey={parentKey} />}
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
  const { data: node } = useNode(parentId);
  const showCompleted = useUiStore((s) => s.showCompleted[key] ?? false);
  const toggleShowCompleted = useUiStore((s) => s.toggleShowCompleted);
  const setFocusedColumnParentId = useUiStore((s) => s.setFocusedColumnParentId);
  const createNode = useCreateNode();

  useEffect(() => {
    setFocusedColumnParentId(key);
  }, [key, setFocusedColumnParentId]);

  return (
    <div className="column" onClick={() => setFocusedColumnParentId(key)}>
      <div className="column-header">
        <span className="column-title">{node?.title ?? ""}</span>
        <div className="column-header-actions">
          <button
            type="button"
            className="icon-button"
            aria-label="New item"
            onClick={() => createNode(key)}
          >
            <PlusIcon />
          </button>
          <button
            type="button"
            className="toggle"
            aria-pressed={showCompleted}
            onClick={() => toggleShowCompleted(key)}
          >
            Show completed
            <span className="toggle-track">
              <span className="toggle-thumb" />
            </span>
          </button>
        </div>
      </div>
      <div className="column-body">
        <ColumnBody parentId={parentId} depth={depth} />
      </div>
    </div>
  );
}
