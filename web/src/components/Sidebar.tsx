import { useDroppable } from "@dnd-kit/core";
import { useColumn } from "../queries/hooks.js";
import { SIDEBAR_DROP_IDS } from "../dnd/sidebarActions.js";
import { useUiStore } from "../store/uiStore.js";

function TodayItem() {
  const { setNodeRef } = useDroppable({ id: SIDEBAR_DROP_IDS.today });
  const setActiveSmartList = useUiStore((s) => s.setActiveSmartList);
  return (
    <li
      ref={setNodeRef}
      data-droppable-id={SIDEBAR_DROP_IDS.today}
      role="button"
      tabIndex={0}
      onClick={() => setActiveSmartList("today")}
    >
      Today
    </li>
  );
}

function LogbookItem() {
  const setActiveSmartList = useUiStore((s) => s.setActiveSmartList);
  return (
    <li role="button" tabIndex={0} onClick={() => setActiveSmartList("logbook")}>
      Logbook
    </li>
  );
}

function TrashItem() {
  const { setNodeRef } = useDroppable({ id: SIDEBAR_DROP_IDS.trash });
  const setActiveSmartList = useUiStore((s) => s.setActiveSmartList);
  return (
    <li
      ref={setNodeRef}
      data-droppable-id={SIDEBAR_DROP_IDS.trash}
      role="button"
      tabIndex={0}
      onClick={() => setActiveSmartList("trash")}
    >
      Trash
    </li>
  );
}

export function Sidebar() {
  const { data: rows } = useColumn(null);
  const select = useUiStore((s) => s.select);

  return (
    <nav>
      <ul>
        <TodayItem />
        <LogbookItem />
        <TrashItem />
      </ul>
      <ul>
        {(rows ?? []).map((row) => (
          <SidebarProjectRow key={row.id} id={row.id} title={row.title} isSystem={row.isSystem} onSelect={() => select(0, { id: row.id, type: "project" })} />
        ))}
      </ul>
    </nav>
  );
}

interface SidebarProjectRowProps {
  id: string;
  title: string;
  isSystem: boolean;
  onSelect(): void;
}

function SidebarProjectRow({ id, title, isSystem, onSelect }: SidebarProjectRowProps) {
  // Inbox is a real, is_system project row — spec 6's "drop on Inbox reparents
  // there" is wired only onto it, not onto ordinary root-level projects.
  const { setNodeRef } = useDroppable({
    id: isSystem ? SIDEBAR_DROP_IDS.inbox : `sidebar-noop-${id}`,
    disabled: !isSystem,
  });

  return (
    <li>
      <button
        ref={isSystem ? setNodeRef : undefined}
        type="button"
        data-droppable-id={isSystem ? SIDEBAR_DROP_IDS.inbox : undefined}
        onClick={onSelect}
      >
        {title}
      </button>
    </li>
  );
}
