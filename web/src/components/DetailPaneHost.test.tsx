// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import "../test/setup.js";
import { mswServer } from "../test/mswServer.js";
import { renderWithProviders } from "../test/renderWithProviders.js";
import { useUiStore } from "../store/uiStore.js";
import { DetailPaneHost } from "./DetailPaneHost.js";

const INITIAL_UI_STATE = useUiStore.getState();

beforeEach(() => {
  useUiStore.setState(INITIAL_UI_STATE, true);
});

const NODE = {
  id: "todo-1",
  type: "todo",
  title: "Buy milk",
  notes: "",
  whenDate: null,
  deadline: null,
  completedAt: null,
  path: [{ id: "p1", type: "project", title: "Work" }],
};

function selectTodo() {
  useUiStore.getState().select(0, { id: "p1", type: "project" });
  useUiStore.getState().select(1, { id: "todo-1", type: "todo" });
}

describe("DetailPaneHost", () => {
  it("renders the detail pane for the selected todo", async () => {
    mswServer.use(http.get("/api/nodes/todo-1", () => HttpResponse.json(NODE)));
    selectTodo();

    renderWithProviders(<DetailPaneHost />);

    expect(await screen.findByText("Buy milk")).toBeInTheDocument();
  });

  it("clicking outside the pane deselects the todo and eventually unmounts the pane", async () => {
    mswServer.use(http.get("/api/nodes/todo-1", () => HttpResponse.json(NODE)));
    selectTodo();

    renderWithProviders(<DetailPaneHost />);
    await screen.findByText("Buy milk");

    fireEvent.mouseDown(document.body);

    // The selection clears immediately...
    await waitFor(() => expect(useUiStore.getState().openPath.at(-1)?.type).not.toBe("todo"));
    // ...but the pane itself stays mounted briefly (closing animation) before unmounting.
    await waitFor(() => expect(screen.queryByText("Buy milk")).not.toBeInTheDocument());
  });

  it("clicking a row-like element does not deselect the todo", async () => {
    mswServer.use(http.get("/api/nodes/todo-1", () => HttpResponse.json(NODE)));
    selectTodo();

    renderWithProviders(<DetailPaneHost />);
    await screen.findByText("Buy milk");

    const otherRow = document.createElement("div");
    otherRow.setAttribute("data-row", "true");
    document.body.appendChild(otherRow);
    fireEvent.mouseDown(otherRow);

    // Give any (incorrect) dismissal a chance to happen, then confirm it didn't.
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(useUiStore.getState().openPath.at(-1)?.type).toBe("todo");
    expect(screen.getByText("Buy milk")).toBeInTheDocument();

    document.body.removeChild(otherRow);
  });

  it("clicking a button element does not deselect the todo", async () => {
    mswServer.use(http.get("/api/nodes/todo-1", () => HttpResponse.json(NODE)));
    selectTodo();

    renderWithProviders(<DetailPaneHost />);
    await screen.findByText("Buy milk");

    const button = document.createElement("button");
    document.body.appendChild(button);
    fireEvent.mouseDown(button);

    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(useUiStore.getState().openPath.at(-1)?.type).toBe("todo");

    document.body.removeChild(button);
  });

  it("switching to a different todo does not unmount the pane in between", async () => {
    mswServer.use(http.get("/api/nodes/todo-1", () => HttpResponse.json(NODE)));
    mswServer.use(
      http.get("/api/nodes/todo-2", () =>
        HttpResponse.json({ ...NODE, id: "todo-2", title: "Buy bread" }),
      ),
    );
    selectTodo();

    renderWithProviders(<DetailPaneHost />);
    await screen.findByText("Buy milk");

    useUiStore.getState().select(1, { id: "todo-2", type: "todo" });

    expect(await screen.findByText("Buy bread")).toBeInTheDocument();
    // Only ever one detail pane in the document — it was updated, not
    // removed and re-added.
    expect(document.querySelectorAll(".detail-pane")).toHaveLength(1);
  });
});
