import { useColumn } from "../queries/hooks.js";
import { useUiStore } from "../store/uiStore.js";

export function Sidebar() {
  const { data: rows } = useColumn(null);
  const select = useUiStore((s) => s.select);

  return (
    <nav>
      <ul>
        <li>Today</li>
        <li>Logbook</li>
        <li>Trash</li>
      </ul>
      <ul>
        {(rows ?? []).map((row) => (
          <li key={row.id}>
            <button type="button" onClick={() => select(0, { id: row.id, type: "project" })}>
              {row.title}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
