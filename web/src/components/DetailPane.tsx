import { useEffect, useRef, useState } from "react";
import { useNode, useRunCommand } from "../queries/hooks.js";
import { CalendarIcon } from "../icons.js";

export interface DetailPaneProps {
  nodeId: string;
  parentId: string;
  /** Plays the slide-out animation in place of the slide-in one — DetailPaneHost keeps this mounted briefly after deselection so the animation has time to run. */
  closing?: boolean;
}

export function DetailPane({ nodeId, parentId, closing = false }: DetailPaneProps) {
  const { data: node, isError } = useNode(nodeId);
  const runCommand = useRunCommand();
  const [notes, setNotes] = useState<string | null>(null);
  const [whenDate, setWhenDate] = useState<string | null>(null);
  const [deadline, setDeadline] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  // Escape cancels immediately, but unmounting the still-focused input right
  // after (this component doesn't remount between rename attempts, so a ref
  // survives across them) can itself fire a native blur — this flag, reset
  // whenever a new rename session starts below, lets the blur handler tell
  // "Escape already resolved this" apart from "the user clicked away." Same
  // pattern as Column.tsx's Row and Sidebar.tsx's SidebarProjectRow.
  const escapedRef = useRef(false);

  useEffect(() => {
    setNotes(null);
  }, [node?.notes]);

  useEffect(() => {
    setWhenDate(null);
  }, [node?.whenDate]);

  useEffect(() => {
    setDeadline(null);
  }, [node?.deadline]);

  // Switching to a different todo mid-rename (DetailPaneHost swaps nodeId on
  // the same mounted instance, no remount) should abandon the edit rather
  // than carry a stale rename session over to the newly selected todo.
  useEffect(() => {
    setIsRenaming(false);
  }, [nodeId]);

  if (!node || isError) return null;

  const breadcrumb = [...node.path].reverse().map((a) => a.title);

  if (isRenaming) {
    escapedRef.current = false;
  }

  const commitRename = (rawTitle: string) => {
    const trimmed = rawTitle.trim();
    // A blank title is rejected server-side too, but checking here avoids
    // the round-trip and keeps the input open to try again instead of
    // silently discarding the edit.
    if (trimmed === "") return false;
    runCommand.mutate({ type: "RenameNode", payload: { nodeId, title: trimmed }, parentId });
    return true;
  };

  return (
    <div className={`detail-pane${closing ? " detail-pane--closing" : ""}`}>
      {breadcrumb.length > 0 && <div className="detail-breadcrumb">{breadcrumb.join(" / ")}</div>}
      <div>
        <div className="detail-type-label">{node.type}</div>
        {isRenaming ? (
          // eslint-disable-next-line jsx-a11y/no-autofocus
          <input
            autoFocus
            className="detail-title-input"
            defaultValue={node.title}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (commitRename(e.currentTarget.value)) setIsRenaming(false);
              } else if (e.key === "Escape") {
                escapedRef.current = true;
                setIsRenaming(false);
              }
            }}
            onBlur={(e) => {
              if (escapedRef.current) return;
              commitRename(e.currentTarget.value);
              setIsRenaming(false);
            }}
          />
        ) : (
          <div className="detail-title" onDoubleClick={() => setIsRenaming(true)}>
            {node.title}
          </div>
        )}
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
