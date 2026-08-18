import { useEffect, useState } from "react";
import { useNode, useRunCommand } from "../queries/hooks.js";

export interface DetailPaneProps {
  nodeId: string;
  parentId: string;
}

export function DetailPane({ nodeId, parentId }: DetailPaneProps) {
  const { data: node } = useNode(nodeId);
  const runCommand = useRunCommand();
  const [notes, setNotes] = useState<string | null>(null);

  useEffect(() => {
    setNotes(null);
  }, [node?.notes]);

  if (!node) return null;

  return (
    <div>
      <label>
        Notes
        <textarea
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
      </label>
      <label>
        When
        <input
          type="date"
          defaultValue={node.whenDate ?? ""}
          onBlur={(e) =>
            runCommand.mutate({
              type: "SetWhen",
              payload: { nodeId, whenDate: e.currentTarget.value || null },
              parentId,
            })
          }
        />
      </label>
      <label>
        Deadline
        <input
          type="date"
          defaultValue={node.deadline ?? ""}
          onBlur={(e) =>
            runCommand.mutate({
              type: "SetDeadline",
              payload: { nodeId, deadline: e.currentTarget.value || null },
              parentId,
            })
          }
        />
      </label>
    </div>
  );
}
