import { useLogbook } from "../queries/hooks.js";

export function LogbookView() {
  const { data: groups } = useLogbook();

  if (!groups) return null;

  return (
    <div data-testid="logbook-view">
      {groups.map((group) => (
        <section key={group.day}>
          <h2>{group.day}</h2>
          <ul>
            {group.rows.map((row) => (
              <li key={row.id}>{row.title}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
