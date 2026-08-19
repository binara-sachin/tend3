import { useEffect, useState } from "react";
import { useNode, useRunCommand } from "../queries/hooks.js";
import { CalendarIcon } from "../icons.js";

export interface DetailPaneProps {
  nodeId: string;
  parentId: string;
}

export function DetailPane({ nodeId, parentId }: DetailPaneProps) {
  const { data: node, isError } = useNode(nodeId);
  const runCommand = useRunCommand();
  const [notes, setNotes] = useState<string | null>(null);
  const [whenDate, setWhenDate] = useState<string | null>(null);
  const [deadline, setDeadline] = useState<string | null>(null);

  useEffect(() => {
    setNotes(null);
  }, [node?.notes]);

  useEffect(() => {
    setWhenDate(null);
  }, [node?.whenDate]);

  useEffect(() => {
    setDeadline(null);
  }, [node?.deadline]);

  if (!node || isError) return null;

  const breadcrumb = [...node.path].reverse().map((a) => a.title);

  return (
    <div className="detail-pane">
      {breadcrumb.length > 0 && <div className="detail-breadcrumb">{breadcrumb.join(" / ")}</div>}
      <div>
        <div className="detail-type-label">{node.type}</div>
        <div className="detail-title">{node.title}</div>
      </div>
      <div>
        <label className="field-label" htmlFor={`detail-notes-${nodeId}`}>
          Notes
        </label>
        <textarea
          id={`detail-notes-${nodeId}`}
          className="detail-notes"
          value={notes ?? node.notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={(e) =>
            runCommand.mutate({
              type: "SetNotes",
              payload: { nodeId, notes: e.currentTarget.value },
              parentId,
            })
          }
        />
      </div>
      <div className="detail-date-fields">
        <div className="detail-date-field">
          <label className="field-label" htmlFor={`detail-when-${nodeId}`}>
            When
          </label>
          <div className={`date-input${whenDate === null && node.whenDate === null ? " date-input--empty" : ""}`}>
            <span className="date-input-icon">
              <CalendarIcon />
            </span>
            <input
              id={`detail-when-${nodeId}`}
              type="date"
              value={whenDate ?? node.whenDate ?? ""}
              onChange={(e) => setWhenDate(e.target.value)}
              onBlur={(e) =>
                runCommand.mutate({
                  type: "SetWhen",
                  payload: { nodeId, whenDate: e.currentTarget.value || null },
                  parentId,
                })
              }
            />
          </div>
        </div>
        <div className="detail-date-field">
          <label className="field-label" htmlFor={`detail-deadline-${nodeId}`}>
            Deadline
          </label>
          <div className={`date-input${deadline === null && node.deadline === null ? " date-input--empty" : ""}`}>
            <span className="date-input-icon">
              <CalendarIcon />
            </span>
            <input
              id={`detail-deadline-${nodeId}`}
              type="date"
              value={deadline ?? node.deadline ?? ""}
              onChange={(e) => setDeadline(e.target.value)}
              onBlur={(e) =>
                runCommand.mutate({
                  type: "SetDeadline",
                  payload: { nodeId, deadline: e.currentTarget.value || null },
                  parentId,
                })
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
