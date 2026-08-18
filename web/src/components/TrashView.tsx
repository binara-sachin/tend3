import { useRunCommand, useTrash } from "../queries/hooks.js";
import { formatDeletedAgo } from "../format/deletedAgo.js";
import { todayDateString } from "../dnd/sidebarActions.js";
import { CircleIcon, FolderIcon, RestoreIcon } from "../icons.js";

export function TrashView() {
  const { data: rows } = useTrash();
  const runCommand = useRunCommand();

  if (!rows) return null;

  const today = todayDateString(new Date());

  function restore(nodeId: string) {
    runCommand.mutate({ type: "RestoreNode", payload: { nodeId } });
  }

  function purge(nodeId: string, title: string) {
    if (!window.confirm(`Permanently delete "${title}"? This cannot be undone.`)) return;
    runCommand.mutate({ type: "PurgeNode", payload: { nodeId } });
  }

  function emptyTrash() {
    if (!window.confirm("Permanently delete everything in the trash? This cannot be undone.")) {
      return;
    }
    runCommand.mutate({ type: "EmptyTrash", payload: {} });
  }

  return (
    <div className="smart-list" data-testid="trash-view">
      <div className="smart-list-header-row">
        <h2 className="smart-list-heading">Trash</h2>
        <div className="trash-actions">
          <button type="button" className="btn btn-primary" onClick={emptyTrash}>
            Empty Trash
          </button>
          <span className="trash-actions-caption">Cannot be undone</span>
        </div>
      </div>
      <ul className="list-reset smart-list-rows">
        {rows.map((row) => (
          <li key={row.id} className="smart-list-row">
            <span className="row-icon">{row.type === "project" ? <FolderIcon /> : <CircleIcon />}</span>
            <span className="row-title">{row.title}</span>
            <span className="row-meta">{formatDeletedAgo(row.deletedAt, today)}</span>
            <span className="trash-row-buttons">
              <button type="button" className="btn btn-secondary" onClick={() => restore(row.id)}>
                <RestoreIcon />
                Restore
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => purge(row.id, row.title)}
              >
                Permanently delete
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
