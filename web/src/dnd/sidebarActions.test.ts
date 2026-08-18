import { describe, expect, it } from "vitest";
import {
  SIDEBAR_DROP_IDS,
  resolveSidebarDrop,
  todayDateString,
} from "./sidebarActions.js";

describe("todayDateString", () => {
  it("formats a given date as a calendar date (no time component)", () => {
    expect(todayDateString(new Date("2026-08-18T23:59:00Z"))).toBe("2026-08-18");
  });

  it("pads single-digit months and days", () => {
    expect(todayDateString(new Date("2026-01-05T00:00:00Z"))).toBe("2026-01-05");
  });
});

describe("resolveSidebarDrop", () => {
  it("resolves the Today target to SetWhen with the given date", () => {
    const result = resolveSidebarDrop(SIDEBAR_DROP_IDS.today, "todo-1", "2026-08-18");
    expect(result).toEqual({
      type: "SetWhen",
      payload: { nodeId: "todo-1", whenDate: "2026-08-18" },
    });
  });

  it("resolves the Inbox target to MoveNode, appended after Inbox's current children", () => {
    const result = resolveSidebarDrop(SIDEBAR_DROP_IDS.inbox, "todo-1", "2026-08-18", {
      inboxId: "inbox-id",
      inboxChildren: [],
    });
    expect(result).toMatchObject({
      type: "MoveNode",
      payload: { nodeId: "todo-1", newParentId: "inbox-id" },
    });
  });

  it("resolves the Trash target to TrashNode", () => {
    const result = resolveSidebarDrop(SIDEBAR_DROP_IDS.trash, "todo-1", "2026-08-18");
    expect(result).toEqual({ type: "TrashNode", payload: { nodeId: "todo-1" } });
  });

  it("returns null for an id that isn't a sidebar drop target", () => {
    expect(resolveSidebarDrop("some-column-row-id", "todo-1", "2026-08-18")).toBeNull();
  });
});
