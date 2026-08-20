import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useRef, useState } from "react";
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
  FolderIcon,
  FolderPlusIcon,
  PlusIcon,
  ProjectProgressIcon,
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
  onToggleComplete(): void;
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
  onToggleComplete,
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
  // Escape cancels immediately, but unmounting the still-focused input right
  // after (this component doesn't remount between rename attempts, so a ref
  // survives across them) can itself fire a native blur — this flag, reset
  // whenever a new rename session starts below, lets the blur handler tell
  // "Escape already resolved this" apart from "the user clicked away."
  const escapedRef = useRef(false);

  if (isRenaming) {
    escapedRef.current = false;
  }

  const badge = row.type === "todo" ? formatColumnDueBadge(row.whenDate, todayDateString(new Date())) : null;

  const icon =
    row.type === "heading" ? (
      <span className="row-icon">{isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}</span>
    ) : row.type === "project" ? (
      <span className="row-icon">
        {row.totalDescendantCount === 0 ? (
          // Nothing to show progress of yet — Things3 shows a plain
          // folder for an empty project too.
          <FolderIcon size={15} />
        ) : row.isComplete ? (
          <CheckCircleIcon size={16} />
        ) : (
          <ProjectProgressIcon
            size={15}
            fraction={(row.totalDescendantCount - row.openDescendantCount) / row.totalDescendantCount}
          />
        )}
      </span>
    ) : (
      // Not given its own ARIA role/label: a descendant's aria-label gets
      // folded into the enclosing row-main button's accessible name (used
      // everywhere rows are looked up by title in tests and elsewhere), so
      // anything beyond aria-hidden here would silently rename every row.
      <span
        className="row-icon row-checkbox"
        // Stops the click from also bubbling to row-main's onSelect (which
        // would open/select the todo) and stops the pointerdown from ever
        // reaching dnd-kit's drag listeners on row-main — otherwise even a
        // tiny amount of pointer movement while clicking the checkbox could
        // register as a drag instead of a tap.
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onToggleComplete();
        }}
      >
        {row.completedAt !== null ? <CheckCircleIcon size={16} /> : <CircleIcon size={16} />}
      </span>
    );

  return (
    <>
      {isOver && !isDragging && <div className="drop-indicator" />}
      <div
        ref={setNodeRef}
        className={`row${isNested && row.type !== "heading" ? " row--nested" : ""}${isDragging ? " row--dragging" : ""}`}
        style={{ transform: CSS.Transform.toString(transform), transition }}
      >
      <div
        ref={row.type === "project" && !isRenaming ? setWholeRowDropRef : undefined}
        {...(isRenaming ? undefined : attributes)}
        {...(isRenaming ? undefined : listeners)}
        role={isRenaming ? undefined : "button"}
        tabIndex={isRenaming ? undefined : 0}
        data-row={isRenaming ? undefined : "true"}
        data-droppable-id={row.type === "project" && !isRenaming ? `project-drop-${row.id}` : undefined}
        className={`row-main${row.type === "heading" ? " row-main--heading" : ""}${isWholeRowOver ? " row-main--drop-target" : ""}`}
        onClick={isRenaming ? undefined : onSelect}
        onDoubleClick={isRenaming ? undefined : onStartRename}
        onKeyDown={
          isRenaming
            ? undefined
            : (e) => {
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
              }
        }
      >
        {icon}
        {isRenaming ? (
          // eslint-disable-next-line jsx-a11y/no-autofocus
          <input
            autoFocus
            className="row-rename-input"
            defaultValue={row.title}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const title = e.currentTarget.value.trim();
                // A blank title is rejected server-side too, but checking
                // here avoids the round-trip and keeps the input open to
                // try again instead of silently discarding the edit.
                if (title === "") return;
                onSubmitRename(title);
              } else if (e.key === "Escape") {
                escapedRef.current = true;
                onCancelRename();
              }
            }}
            onBlur={(e) => {
              if (escapedRef.current) return;
              const title = e.currentTarget.value.trim();
              // Clicking away with a blank field has nothing valid to
              // commit — cancel instead of leaving an unfocused, empty
              // input stranded.
              if (title === "") {
                onCancelRename();
                return;
              }
              onSubmitRename(title);
            }}
          />
        ) : (
          <>
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
          </>
        )}
      </div>
      </div>
    </>
  );
}

function NewItemRow({ parentKey }: { parentKey: string }) {
  const submitNewNode = useSubmitNewNode();
  const setCreatingParentId = useUiStore((s) => s.setCreatingParentId);
  const creatingType = useUiStore((s) => s.creatingType);
  // Root children are always projects (invariant 3); everywhere else this
  // mirrors useSubmitNewNode's own default-inference, so the icon shown here
  // always matches what actually gets created.
  const type = parentKey === "root" ? "project" : (creatingType ?? "todo");
  // Escape cancels immediately, but unmounting the still-focused input right
  // after can itself fire a native blur — this flag lets the blur handler
  // tell "Escape already resolved this" apart from "the user clicked away."
  // Same pattern as Column.tsx's Row and Sidebar.tsx's SidebarProjectRow.
  const escapedRef = useRef(false);

  return (
    <li>
      <div className="row">
        <div className="row-main">
          <span className="row-icon">
            {type === "project" ? <FolderIcon size={15} /> : <CircleIcon size={16} />}
          </span>
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <input
            autoFocus
            className="row-rename-input"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                submitNewNode(parentKey, e.currentTarget.value);
              } else if (e.key === "Escape") {
                escapedRef.current = true;
                setCreatingParentId(null);
              }
            }}
            onBlur={(e) => {
              if (escapedRef.current) return;
              const trimmed = e.currentTarget.value.trim();
              // Clicking away with a blank field has nothing valid to
              // create — dismiss instead of leaving an unfocused, empty
              // input stranded.
              if (trimmed === "") {
                setCreatingParentId(null);
                return;
              }
              submitNewNode(parentKey, e.currentTarget.value);
            }}
          />
        </div>
      </div>
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

  function toggleCompleted(row: ColumnRow) {
    runCommand.mutate({
      type: "SetCompleted",
      payload: { nodeId: row.id, completed: row.completedAt === null },
      parentId: parentKey,
    });
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
              onToggleComplete={() => toggleCompleted(row)}
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
          {node?.type === "project" && (
            <button
              type="button"
              className="icon-button"
              aria-label="New sub-project"
              onClick={() => createNode(key, "project")}
            >
              <FolderPlusIcon />
            </button>
          )}
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
