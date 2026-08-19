import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useRef, useState } from "react";
import { useColumn, useRunCommand } from "../queries/hooks.js";
import { useCreateNode, useSubmitNewNode } from "../queries/useCreateNode.js";
import { SIDEBAR_DROP_IDS } from "../dnd/sidebarActions.js";
import { useUiStore } from "../store/uiStore.js";
import { LogbookIcon, PlusIcon, TodayIcon, TrashIcon } from "../icons.js";

function TodayItem() {
  const { setNodeRef, isOver } = useDroppable({ id: SIDEBAR_DROP_IDS.today });
  const isSelected = useUiStore((s) => s.activeSmartList === "today");
  const setActiveSmartList = useUiStore((s) => s.setActiveSmartList);
  return (
    <li
      ref={setNodeRef}
      data-droppable-id={SIDEBAR_DROP_IDS.today}
      role="button"
      tabIndex={0}
      className={`sidebar-item${isSelected ? " sidebar-item--selected" : ""}${isOver ? " sidebar-item--drop-target" : ""}`}
      onClick={() => setActiveSmartList("today")}
    >
      <span className="sidebar-item-icon">
        <TodayIcon size={15} />
      </span>
      Today
    </li>
  );
}

function LogbookItem() {
  const isSelected = useUiStore((s) => s.activeSmartList === "logbook");
  const setActiveSmartList = useUiStore((s) => s.setActiveSmartList);
  return (
    <li
      role="button"
      tabIndex={0}
      className={`sidebar-item${isSelected ? " sidebar-item--selected" : ""}`}
      onClick={() => setActiveSmartList("logbook")}
    >
      <span className="sidebar-item-icon">
        <LogbookIcon size={15} />
      </span>
      Logbook
    </li>
  );
}

function TrashItem() {
  const { setNodeRef, isOver } = useDroppable({ id: SIDEBAR_DROP_IDS.trash });
  const isSelected = useUiStore((s) => s.activeSmartList === "trash");
  const setActiveSmartList = useUiStore((s) => s.setActiveSmartList);
  return (
    <li
      ref={setNodeRef}
      data-droppable-id={SIDEBAR_DROP_IDS.trash}
      role="button"
      tabIndex={0}
      className={`sidebar-item${isSelected ? " sidebar-item--selected" : ""}${isOver ? " sidebar-item--drop-target" : ""}`}
      onClick={() => setActiveSmartList("trash")}
    >
      <span className="sidebar-item-icon">
        <TrashIcon size={15} />
      </span>
      Trash
    </li>
  );
}

export function Sidebar() {
  const { data: rows } = useColumn(null);
  const select = useUiStore((s) => s.select);
  const setActiveSelection = useUiStore((s) => s.setActiveSelection);
  const setFocusedColumnParentId = useUiStore((s) => s.setFocusedColumnParentId);
  const activeSmartList = useUiStore((s) => s.activeSmartList);
  const openRootId = useUiStore((s) => s.openPath[0]?.id);
  const creatingParentId = useUiStore((s) => s.creatingParentId);
  const setCreatingParentId = useUiStore((s) => s.setCreatingParentId);
  const createNode = useCreateNode();
  const submitNewNode = useSubmitNewNode();

  // The sidebar renders depth 0 of the tree (spec 1) but is never a
  // Column, so nothing else ever gives Cmd+N a root-level target — this is
  // that target, "root" being the same string sentinel the /api/columns
  // route already uses for the same concept.
  useEffect(() => {
    setFocusedColumnParentId("root");
  }, [setFocusedColumnParentId]);

  return (
    <nav className="sidebar">
      <ul className="list-reset">
        <TodayItem />
        <LogbookItem />
        <TrashItem />
      </ul>
      <div className="sidebar-divider" />
      <ul className="list-reset">
        <SortableContext
          items={(rows ?? []).filter((r) => !r.isSystem).map((r) => r.id)}
          strategy={verticalListSortingStrategy}
        >
          {(rows ?? []).map((row) => (
            <SidebarProjectRow
              key={row.id}
              id={row.id}
              title={row.title}
              sortKey={row.sortKey}
              isSystem={row.isSystem}
              isSelected={activeSmartList === null && openRootId === row.id}
              onSelect={() => {
                setActiveSelection({ parentId: "root", nodeId: row.id, type: "project" });
                select(0, { id: row.id, type: "project" });
              }}
            />
          ))}
        </SortableContext>
        {creatingParentId === "root" && (
          <li>
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <input
              autoFocus
              className="sidebar-rename-input"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  submitNewNode("root", e.currentTarget.value);
                } else if (e.key === "Escape") {
                  setCreatingParentId(null);
                }
              }}
            />
          </li>
        )}
        <li>
          <button type="button" className="sidebar-item sidebar-item--add" onClick={() => createNode("root")}>
            <span className="sidebar-item-icon">
              <PlusIcon size={13} />
            </span>
            New Project
          </button>
        </li>
      </ul>
    </nav>
  );
}

interface SidebarProjectRowProps {
  id: string;
  title: string;
  sortKey: string;
  isSystem: boolean;
  isSelected: boolean;
  onSelect(): void;
}

function SidebarProjectRow({
  id,
  title,
  sortKey,
  isSystem,
  isSelected,
  onSelect,
}: SidebarProjectRowProps) {
  // Inbox is a real, is_system project row — spec 6's "drop on Inbox reparents
  // there" is wired only onto it, not onto ordinary root-level projects.
  const { setNodeRef, isOver: isInboxOver } = useDroppable({
    id: isSystem ? SIDEBAR_DROP_IDS.inbox : `sidebar-noop-${id}`,
    disabled: !isSystem,
  });
  // Ordinary root-level projects are whole-row "drop into project" targets
  // too, via the same project-drop-<id> id Column.tsx's in-column project
  // rows already use — DragProvider's WHOLE_ROW_DROP_PREFIX branch and its
  // pointerWithin collision priority handle it with no new drag logic. This
  // is what lets a task be dragged from the currently open project directly
  // onto a DIFFERENT root-level project, since only one root project's
  // column chain is ever open at once.
  const { setNodeRef: setWholeRowDropRef, isOver: isWholeRowOver } = useDroppable({
    id: `project-drop-${id}`,
    data: { parentId: id, type: "whole-row" },
    disabled: isSystem,
  });
  // Inbox is pinned first and never draggable — its own sortable id is
  // simply excluded from the SortableContext's items (see Sidebar()), and
  // this hook is disabled for it too so it never initiates a drag.
  const {
    setNodeRef: setSortableRef,
    attributes,
    listeners,
    transform,
    transition,
  } = useSortable({
    id,
    data: { parentId: "root", sortKey, type: "project", title },
    disabled: isSystem,
  });
  const runCommand = useRunCommand();
  const [isRenaming, setIsRenaming] = useState(false);
  // Escape cancels immediately, but unmounting the still-focused input right
  // after (this component doesn't remount between rename attempts, so a ref
  // survives across them) can itself fire a native blur — this flag, reset
  // whenever a new rename session starts below, lets the blur handler tell
  // "Escape already resolved this" apart from "the user clicked away."
  const escapedRef = useRef(false);

  if (isRenaming) {
    escapedRef.current = false;

    const commitRename = (rawTitle: string) => {
      const trimmed = rawTitle.trim();
      // A blank title is rejected server-side too, but checking here avoids
      // the round-trip and keeps the input open to try again instead of
      // silently discarding the edit.
      if (trimmed === "") return false;
      runCommand.mutate({
        type: "RenameNode",
        payload: { nodeId: id, title: trimmed },
        parentId: null,
      });
      return true;
    };

    return (
      <li>
        {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
        <input
          autoFocus
          className="sidebar-rename-input"
          defaultValue={title}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (commitRename(e.currentTarget.value)) setIsRenaming(false);
            } else if (e.key === "Escape") {
              escapedRef.current = true;
              setIsRenaming(false);
            }
          }}
          onBlur={(e) => {
            if (escapedRef.current) return;
            // Clicking away with a blank field has nothing valid to commit —
            // cancel instead of leaving an unfocused, empty input stranded.
            commitRename(e.currentTarget.value);
            setIsRenaming(false);
          }}
        />
      </li>
    );
  }

  const row = (
    <button
      ref={(node) => {
        if (isSystem) {
          setNodeRef(node);
        } else {
          setSortableRef(node);
          setWholeRowDropRef(node);
        }
      }}
      type="button"
      className={`sidebar-item${isSelected ? " sidebar-item--selected" : ""}${isInboxOver || isWholeRowOver ? " sidebar-item--drop-target" : ""}`}
      data-droppable-id={isSystem ? SIDEBAR_DROP_IDS.inbox : `project-drop-${id}`}
      style={isSystem ? undefined : { transform: CSS.Transform.toString(transform), transition }}
      {...(isSystem ? undefined : attributes)}
      {...(isSystem ? undefined : listeners)}
      onClick={onSelect}
      onDoubleClick={() => setIsRenaming(true)}
    >
      {title}
    </button>
  );

  if (isSystem) {
    return <li>{row}</li>;
  }

  return <li className="row">{row}</li>;
}
