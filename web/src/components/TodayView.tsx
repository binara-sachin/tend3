import { useToday } from "../queries/hooks.js";

export function TodayView() {
  const { data: groups } = useToday();

  if (!groups) return null;

  return (
    <div data-testid="today-view">
      {groups.map((group) => (
        <section key={group.projectId}>
          <h2>{group.projectTitle}</h2>
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
