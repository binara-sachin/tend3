import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useState } from "react";
import { useColumn, useRunCommand } from "../queries/hooks.js";
import { useCreateNode } from "../queries/useCreateNode.js";
import { SIDEBAR_DROP_IDS } from "../dnd/sidebarActions.js";
import { useUiStore } from "../store/uiStore.js";
import { DragHandleIcon, LogbookIcon, PlusIcon, TodayIcon, TrashIcon } from "../icons.js";

function TodayItem() {
  const { setNodeRef } = useDroppable({ id: SIDEBAR_DROP_IDS.today });
  const isSelected = useUiStore((s) => s.activeSmartList === "today");
  const setActiveSmartList = useUiStore((s) => s.setActiveSmartList);
  return (
    <li
      ref={setNodeRef}
      data-droppable-id={SIDEBAR_DROP_IDS.today}
      role="button"
      tabIndex={0}
      className={`sidebar-item${isSelected ? " sidebar-item--selected" : ""}`}
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
  const { setNodeRef } = useDroppable({ id: SIDEBAR_DROP_IDS.trash });
  const isSelected = useUiStore((s) => s.activeSmartList === "trash");
  const setActiveSmartList = useUiStore((s) => s.setActiveSmartList);
  return (
    <li
      ref={setNodeRef}
      data-droppable-id={SIDEBAR_DROP_IDS.trash}
      role="button"
      tabIndex={0}
      className={`sidebar-item${isSelected ? " sidebar-item--selected" : ""}`}
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
  const createNode = useCreateNode();

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
  const { setNodeRef } = useDroppable({
    id: isSystem ? SIDEBAR_DROP_IDS.inbox : `sidebar-noop-${id}`,
    disabled: !isSystem,
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

  if (isRenaming) {
    return (
      <li>
        {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
        <input
          autoFocus
          className="sidebar-rename-input"
          defaultValue={title}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              runCommand.mutate({
                type: "RenameNode",
                payload: { nodeId: id, title: e.currentTarget.value },
                parentId: null,
              });
              setIsRenaming(false);
            } else if (e.key === "Escape") {
              setIsRenaming(false);
            }
          }}
        />
      </li>
    );
  }

  const row = (
    <button
      ref={isSystem ? setNodeRef : setSortableRef}
      type="button"
      className={`sidebar-item${isSelected ? " sidebar-item--selected" : ""}`}
      data-droppable-id={isSystem ? SIDEBAR_DROP_IDS.inbox : undefined}
      style={isSystem ? undefined : { transform: CSS.Transform.toString(transform), transition }}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault(); // suppress the native click-on-Enter; rename, don't (also) select-navigate
          setIsRenaming(true);
        }
      }}
    >
      {title}
    </button>
  );

  if (isSystem) {
    return <li>{row}</li>;
  }

  return (
    <li className="row">
      <button type="button" className="row-drag-handle" aria-label={`Drag ${title}`} {...attributes} {...listeners}>
        <DragHandleIcon />
      </button>
      {row}
    </li>
  );
}
