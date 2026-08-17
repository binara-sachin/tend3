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

describe("setSelection", () => {
  it("records the selected node id for a parent", () => {
    useUiStore.getState().setSelection("p1", "n1");

    expect(useUiStore.getState().selection.p1).toBe("n1");
  });
});
