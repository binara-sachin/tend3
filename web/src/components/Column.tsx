import { useState } from "react";
import { useColumn, useRunCommand } from "../queries/hooks.js";
import { useUiStore } from "../store/uiStore.js";

function columnKey(parentId: string | null): string {
  return parentId ?? "root";
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
      parentId: columnKey(parentId),
    });
    setRenamingId(null);
  }

  return (
    <ul>
      {visibleRows.map((row) => (
        <li key={row.id}>
          {renamingId === row.id ? (
            // eslint-disable-next-line jsx-a11y/no-autofocus
            <input
              autoFocus
              defaultValue={row.title}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitRename(row.id, e.currentTarget.value);
                else if (e.key === "Escape") setRenamingId(null);
              }}
            />
          ) : (
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                setActiveSelection({ parentId: columnKey(parentId), nodeId: row.id, type: row.type });
                if (row.type === "heading") {
                  toggleHeading(row.id);
                } else {
                  select(depth, { id: row.id, type: row.type });
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") setRenamingId(row.id);
              }}
            >
              {row.title}
            </div>
          )}
          {row.type === "heading" && expandedHeadings.has(row.id) && (
            <ColumnBody parentId={row.id} depth={depth} />
          )}
        </li>
      ))}
    </ul>
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

  return (
    <div>
      <button type="button" aria-pressed={showCompleted} onClick={() => toggleShowCompleted(key)}>
        Show completed
      </button>
      <ColumnBody parentId={parentId} depth={depth} />
    </div>
  );
}
