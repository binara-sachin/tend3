// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { useUiStore } from "./uiStore.js";

const INITIAL_STATE = useUiStore.getState();

beforeEach(() => {
  useUiStore.setState(INITIAL_STATE, true);
});

describe("select", () => {
  it("appends to an empty open path", () => {
    useUiStore.getState().select(0, { id: "a", type: "project" });

    expect(useUiStore.getState().openPath).toEqual([{ id: "a", type: "project" }]);
  });

  it("appends at the next depth without disturbing earlier entries", () => {
    const { select } = useUiStore.getState();
    select(0, { id: "a", type: "project" });
    select(1, { id: "b", type: "project" });

    expect(useUiStore.getState().openPath.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("truncates the open path when re-selecting at an earlier depth", () => {
    const { select } = useUiStore.getState();
    select(0, { id: "a", type: "project" });
    select(1, { id: "b", type: "project" });
    select(1, { id: "c", type: "project" });

    expect(useUiStore.getState().openPath.map((e) => e.id)).toEqual(["a", "c"]);
  });
});

describe("setColumnWidth", () => {
  it("sets the width for a given column index", () => {
    useUiStore.getState().setColumnWidth(1, 320);

    expect(useUiStore.getState().columnWidths[1]).toBe(320);
  });
});

describe("toggleShowCompleted", () => {
  it("flips from unset (falsy) to true, then back to false", () => {
    const { toggleShowCompleted } = useUiStore.getState();
    const parentId = "p1";

    toggleShowCompleted(parentId);
    expect(useUiStore.getState().showCompleted[parentId]).toBe(true);

    toggleShowCompleted(parentId);
    expect(useUiStore.getState().showCompleted[parentId]).toBe(false);
  });
});

describe("setActiveSelection", () => {
  it("records the active selection with its parent and type", () => {
    useUiStore.getState().setActiveSelection({ parentId: "p1", nodeId: "n1", type: "todo" });

    expect(useUiStore.getState().activeSelection).toEqual({
      parentId: "p1",
      nodeId: "n1",
      type: "todo",
    });
  });
});

describe("setFocusedColumnParentId", () => {
  it("records which column currently has focus, independent of any row selection", () => {
    useUiStore.getState().setFocusedColumnParentId("p1");

    expect(useUiStore.getState().focusedColumnParentId).toBe("p1");
  });
});

describe("setActiveSmartList", () => {
  it("records which smart list (Today/Logbook/Trash) is active", () => {
    useUiStore.getState().setActiveSmartList("today");

    expect(useUiStore.getState().activeSmartList).toBe("today");
  });

  it("clears back to null", () => {
    useUiStore.getState().setActiveSmartList("trash");
    useUiStore.getState().setActiveSmartList(null);

    expect(useUiStore.getState().activeSmartList).toBeNull();
  });
});

describe("select", () => {
  it("clears the active smart list — selecting a project returns to the column stack", () => {
    useUiStore.getState().setActiveSmartList("today");

    useUiStore.getState().select(0, { id: "a", type: "project" });

    expect(useUiStore.getState().activeSmartList).toBeNull();
  });
});

describe("setSearchOpen", () => {
  it("opens and closes the search palette", () => {
    useUiStore.getState().setSearchOpen(true);
    expect(useUiStore.getState().isSearchOpen).toBe(true);

    useUiStore.getState().setSearchOpen(false);
    expect(useUiStore.getState().isSearchOpen).toBe(false);
  });
});

describe("setHeadingExpanded", () => {
  it("expands and collapses a heading, independent of other headings", () => {
    useUiStore.getState().setHeadingExpanded("h1", true);
    expect(useUiStore.getState().expandedHeadings.h1).toBe(true);
    expect(useUiStore.getState().expandedHeadings.h2).toBeFalsy();

    useUiStore.getState().setHeadingExpanded("h1", false);
    expect(useUiStore.getState().expandedHeadings.h1).toBe(false);
  });
});
