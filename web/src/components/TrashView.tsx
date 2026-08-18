import { useRunCommand, useTrash } from "../queries/hooks.js";

export function TrashView() {
  const { data: rows } = useTrash();
  const runCommand = useRunCommand();

  if (!rows) return null;

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
    <div data-testid="trash-view">
      <button type="button" onClick={emptyTrash}>
        Empty Trash
      </button>
      <ul>
        {rows.map((row) => (
          <li key={row.id}>
            {row.title}
            <button type="button" onClick={() => restore(row.id)}>
              Restore
            </button>
            <button type="button" onClick={() => purge(row.id, row.title)}>
              Permanently delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
