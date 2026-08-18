import { useLogbook } from "../queries/hooks.js";
import { formatLogbookDay } from "../format/logbookDay.js";
import { todayDateString } from "../dnd/sidebarActions.js";
import { CheckCircleIcon, FolderIcon } from "../icons.js";

export function LogbookView() {
  const { data: groups } = useLogbook();

  if (!groups) return null;

  const today = todayDateString(new Date());

  return (
    <div className="smart-list" data-testid="logbook-view">
      <h2 className="smart-list-heading">Logbook</h2>
      {groups.map((group) => (
        <section key={group.day} className="smart-list-group">
          <h3 className="smart-list-group-label">{formatLogbookDay(group.day, today)}</h3>
          <ul className="list-reset smart-list-rows">
            {group.rows.map((row) => (
              <li key={row.id} className="smart-list-row">
                <span className="row-icon">
                  {row.type === "project" ? <FolderIcon /> : <CheckCircleIcon />}
                </span>
                <span className="row-title">{row.title}</span>
                {row.type === "project" ? (
                  <span className="tag">Project</span>
                ) : (
                  row.parentTitle && <span className="row-meta">{row.parentTitle}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
