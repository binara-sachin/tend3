import { fixedClock } from "../../lib/clock.js";
import { generateId } from "../../lib/id.js";
import type { NewNodeInput, NodeType } from "../../repo/types.js";

const clock = fixedClock("2024-01-01T00:00:00.000Z");

export function newNodeInput(
  overrides: Partial<NewNodeInput> & { type: NodeType },
): NewNodeInput {
  const now = clock();
  return {
    id: generateId(),
    parentId: null,
    title: "",
    notes: "",
    sortKey: "a0",
    whenDate: null,
    deadline: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
