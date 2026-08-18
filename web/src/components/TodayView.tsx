import { useToday } from "../queries/hooks.js";
import { formatTodayBadge } from "../format/dueBadge.js";
import { todayDateString } from "../dnd/sidebarActions.js";
import { CircleIcon } from "../icons.js";

export function TodayView() {
  const { data: groups } = useToday();

  if (!groups) return null;

  const today = todayDateString(new Date());

  return (
    <div className="smart-list" data-testid="today-view">
      <h2 className="smart-list-heading">Today</h2>
      {groups.map((group) => (
        <section key={group.projectId} className="smart-list-group">
          <h3 className="smart-list-group-label">{group.projectTitle}</h3>
          <ul className="list-reset smart-list-rows">
            {group.rows.map((row) => {
              const badge = formatTodayBadge(row.whenDate ?? null, row.deadline ?? null, today);
              return (
                <li key={row.id} className="smart-list-row">
                  <span className="row-icon">
                    <CircleIcon />
                  </span>
                  <span className="row-title">{row.title}</span>
                  <span className={`badge badge--${badge.tone}`}>{badge.text}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
