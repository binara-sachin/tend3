// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import "../test/setup.js";
import { mswServer } from "../test/mswServer.js";
import { renderWithProviders } from "../test/renderWithProviders.js";
import { useUiStore } from "../store/uiStore.js";
import { Column } from "./Column.js";

const INITIAL_UI_STATE = useUiStore.getState();

beforeEach(() => {
  useUiStore.setState(INITIAL_UI_STATE, true);
});

function stubColumn(parentId: string, rows: unknown[]) {
  mswServer.use(http.get(`/api/columns/${parentId}`, () => HttpResponse.json(rows)));
}

const PROJECT_ROW = {
  id: "proj-1",
  type: "project",
  title: "Groceries",
  isSystem: false,
  whenDate: null,
  deadline: null,
  completedAt: null,
  isComplete: false,
  openDescendantCount: 0,
  totalDescendantCount: 0,
};

const TODO_ROW = {
  id: "todo-1",
  type: "todo",
  title: "Buy milk",
  isSystem: false,
  whenDate: null,
  deadline: null,
  completedAt: null,
  isComplete: null,
  openDescendantCount: 0,
};

describe("Column", () => {
  it("marks itself as the focused column on mount, even before any row is selected", async () => {
    stubColumn("p1", []);

    renderWithProviders(<Column parentId="p1" depth={0} />);

    await waitFor(() => expect(useUiStore.getState().focusedColumnParentId).toBe("p1"));
  });

  it("renders each row's title", async () => {
    stubColumn("p1", [PROJECT_ROW, TODO_ROW]);

    renderWithProviders(<Column parentId="p1" depth={0} />);

    expect(await screen.findByText("Groceries")).toBeInTheDocument();
    expect(screen.getByText("Buy milk")).toBeInTheDocument();
  });

  it("selecting a project row appends it to the open path at this depth", async () => {
    stubColumn("p1", [PROJECT_ROW]);
    const user = userEvent.setup();

    renderWithProviders(<Column parentId="p1" depth={0} />);
    await user.click(await screen.findByText("Groceries"));

    expect(useUiStore.getState().openPath).toEqual([{ id: "proj-1", type: "project" }]);
  });

  it("double-clicking a row enters inline rename, and Enter submits RenameNode", async () => {
    stubColumn("p1", [TODO_ROW]);
    let capturedBody: unknown;
    mswServer.use(
      http.post("/api/commands", async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ id: "todo-1", title: "Buy oat milk" });
      }),
    );
    const user = userEvent.setup();

    renderWithProviders(<Column parentId="p1" depth={0} />);
    const row = await screen.findByText("Buy milk");
    await user.dblClick(row);

    const input = await screen.findByRole("textbox");
    expect(input).toHaveValue("Buy milk");

    await user.clear(input);
    await user.type(input, "Buy oat milk");
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(capturedBody).toEqual({
        type: "RenameNode",
        payload: { nodeId: "todo-1", title: "Buy oat milk" },
      }),
    );
  });

  it("keeps the row's icon visible next to the input while renaming, instead of replacing the whole row", async () => {
    stubColumn("p1", [PROJECT_ROW, TODO_ROW]);
    const user = userEvent.setup();

    renderWithProviders(<Column parentId="p1" depth={0} />);
    const projectRow = await screen.findByText("Groceries");
    await user.dblClick(projectRow);
    const projectInput = await screen.findByRole("textbox");
    expect(projectInput.parentElement?.querySelector(".row-icon")).not.toBeNull();
    await user.keyboard("{Escape}");

    const todoRow = await screen.findByText("Buy milk");
    await user.dblClick(todoRow);
    const todoInput = await screen.findByRole("textbox");
    expect(todoInput.parentElement?.querySelector(".row-icon")).not.toBeNull();
  });

  it("submitting a blank title while renaming does not submit RenameNode, and leaves the input open", async () => {
    stubColumn("p1", [TODO_ROW]);
    let called = false;
    mswServer.use(
      http.post("/api/commands", () => {
        called = true;
        return HttpResponse.json({});
      }),
    );
    const user = userEvent.setup();

    renderWithProviders(<Column parentId="p1" depth={0} />);
    const row = await screen.findByText("Buy milk");
    await user.dblClick(row);

    const input = await screen.findByRole("textbox");
    await user.clear(input);
    await user.keyboard("{Enter}");

    expect(called).toBe(false);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("clicking outside the rename input submits RenameNode with the edited title", async () => {
    stubColumn("p1", [TODO_ROW]);
    let capturedBody: unknown;
    mswServer.use(
      http.post("/api/commands", async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ id: "todo-1", title: "Buy oat milk" });
      }),
    );
    const user = userEvent.setup();

    renderWithProviders(<Column parentId="p1" depth={0} />);
    const row = await screen.findByText("Buy milk");
    await user.dblClick(row);

    const input = await screen.findByRole("textbox");
    await user.clear(input);
    await user.type(input, "Buy oat milk");
    // "Show completed" is an inert click target — unlike "New item" it has
    // no side effect (like opening its own input) that would confuse this
    // assertion.
    await user.click(screen.getByRole("button", { name: "Show completed" }));

    await waitFor(() =>
      expect(capturedBody).toEqual({
        type: "RenameNode",
        payload: { nodeId: "todo-1", title: "Buy oat milk" },
      }),
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("clicking outside a blank rename input cancels the rename instead of submitting", async () => {
    stubColumn("p1", [TODO_ROW]);
    let called = false;
    mswServer.use(
      http.post("/api/commands", () => {
        called = true;
        return HttpResponse.json({});
      }),
    );
    const user = userEvent.setup();

    renderWithProviders(<Column parentId="p1" depth={0} />);
    const row = await screen.findByText("Buy milk");
    await user.dblClick(row);

    const input = await screen.findByRole("textbox");
    await user.clear(input);
    await user.click(screen.getByRole("button", { name: "Show completed" }));

    expect(called).toBe(false);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("Buy milk")).toBeInTheDocument(); // reverted to the row
  });

  it("hides completed todos by default and reveals them via the show-completed toggle, with no network call", async () => {
    const completedTodo = { ...TODO_ROW, id: "todo-2", title: "Done thing", completedAt: "2024-01-01" };
    stubColumn("p1", [TODO_ROW, completedTodo]);
    let postCount = 0;
    mswServer.use(
      http.post("/api/commands", () => {
        postCount += 1;
        return HttpResponse.json({});
      }),
    );
    const user = userEvent.setup();

    renderWithProviders(<Column parentId="p1" depth={0} />);
    await screen.findByText("Buy milk");
    expect(screen.queryByText("Done thing")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /show completed/i }));
    expect(await screen.findByText("Done thing")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /show completed/i }));
    expect(screen.queryByText("Done thing")).not.toBeInTheDocument();

    expect(postCount).toBe(0);
  });

  it("ArrowDown/ArrowUp moves focus between rows in the same list", async () => {
    const secondRow = { ...TODO_ROW, id: "todo-2", title: "Buy bread" };
    stubColumn("p1", [PROJECT_ROW, secondRow]);
    const user = userEvent.setup();

    renderWithProviders(<Column parentId="p1" depth={0} />);
    const first = await screen.findByText("Groceries");
    first.focus();

    await user.keyboard("{ArrowDown}");
    expect(screen.getByText("Buy bread")).toHaveFocus();

    await user.keyboard("{ArrowUp}");
    expect(screen.getByText("Groceries")).toHaveFocus();
  });

  it("shows a plain folder icon for a project with no live todo descendants", async () => {
    stubColumn("p1", [PROJECT_ROW]); // totalDescendantCount: 0

    renderWithProviders(<Column parentId="p1" depth={0} />);
    await screen.findByText("Groceries");

    const icon = document.querySelector(".row-icon svg");
    expect(icon?.querySelector("path")).not.toBeNull();
    expect(icon?.querySelector("circle")).toBeNull();
  });

  it("shows a progress ring for a project with some open and some completed descendants", async () => {
    stubColumn("p1", [{ ...PROJECT_ROW, totalDescendantCount: 4, openDescendantCount: 1 }]);

    renderWithProviders(<Column parentId="p1" depth={0} />);
    await screen.findByText("Groceries");

    const icon = document.querySelector(".row-icon svg");
    const circles = icon?.querySelectorAll("circle");
    expect(circles).toHaveLength(2); // track + progress arc
    // 3 of 4 complete — the arc's dashoffset should reflect a non-zero,
    // non-full fraction (not 0 = fully filled, not the full circumference =
    // empty).
    const progressCircle = circles?.[1] as SVGCircleElement;
    const circumference = 2 * Math.PI * 7;
    const dashoffset = Number(progressCircle.getAttribute("stroke-dashoffset"));
    expect(dashoffset).toBeGreaterThan(0);
    expect(dashoffset).toBeLessThan(circumference);
  });

  it("shows the same complete checkmark icon a todo gets, for a fully-complete project", async () => {
    stubColumn("p1", [
      { ...PROJECT_ROW, totalDescendantCount: 2, openDescendantCount: 0, isComplete: true },
    ]);

    renderWithProviders(<Column parentId="p1" depth={0} />);
    await screen.findByText("Groceries");

    const icon = document.querySelector(".row-icon svg");
    expect(icon?.querySelector("rect")).not.toBeNull(); // the rounded-square "complete" fill
    expect(icon?.querySelector("path")).not.toBeNull(); // the checkmark
    expect(icon?.querySelectorAll("circle")).toHaveLength(0);
  });

  it("registers a project row as a whole-row drop target, distinct from its sortable id", async () => {
    stubColumn("p1", [PROJECT_ROW]);

    renderWithProviders(<Column parentId="p1" depth={0} />);
    await screen.findByText("Groceries");

    expect(document.querySelector('[data-droppable-id="project-drop-proj-1"]')).not.toBeNull();
  });

  it("the header's + button opens a blank title input instead of creating anything yet", async () => {
    stubColumn("p1", [TODO_ROW]);
    let called = false;
    mswServer.use(
      http.post("/api/commands", () => {
        called = true;
        return HttpResponse.json({ id: "new-1" });
      }),
    );
    const user = userEvent.setup();

    renderWithProviders(<Column parentId="p1" depth={0} />);
    await screen.findByText("Buy milk");
    await user.click(screen.getByRole("button", { name: /new item/i }));

    expect(await screen.findByRole("textbox")).toHaveValue("");
    expect(called).toBe(false);
  });

  it("shows a checkbox icon next to the new-item input, matching what a real todo row would show", async () => {
    stubColumn("p1", [TODO_ROW]);
    const user = userEvent.setup();

    renderWithProviders(<Column parentId="p1" depth={0} />);
    await screen.findByText("Buy milk");
    await user.click(screen.getByRole("button", { name: /new item/i }));

    const input = await screen.findByRole("textbox");
    const icon = input.parentElement?.querySelector(".row-icon svg");
    expect(icon?.querySelector("rect")).not.toBeNull(); // CircleIcon's rounded square
    expect(icon?.querySelector("path")).toBeNull();
  });

  it("shows a folder icon next to the new-sub-project input, matching what a real project row would show", async () => {
    stubColumn("p1", [TODO_ROW]);
    mswServer.use(
      http.get("/api/nodes/p1", () =>
        HttpResponse.json({
          id: "p1",
          type: "project",
          title: "Groceries",
          notes: "",
          whenDate: null,
          deadline: null,
          completedAt: null,
          path: [],
        }),
      ),
    );
    const user = userEvent.setup();

    renderWithProviders(<Column parentId="p1" depth={0} />);
    await screen.findByText("Buy milk");
    await user.click(screen.getByRole("button", { name: "New sub-project" }));

    const input = await screen.findByRole("textbox");
    const icon = input.parentElement?.querySelector(".row-icon svg");
    // FolderIcon renders a single distinctive path and no rect/circle.
    expect(icon?.querySelector("path")).not.toBeNull();
    expect(icon?.querySelectorAll("rect, circle")).toHaveLength(0);
  });

  it("submitting the + button's title input creates a new node with that title", async () => {
    stubColumn("p1", [TODO_ROW]);
    let capturedBody: unknown;
    mswServer.use(
      http.post("/api/commands", async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ id: "new-1" });
      }),
    );
    const user = userEvent.setup();

    renderWithProviders(<Column parentId="p1" depth={0} />);
    await screen.findByText("Buy milk");
    await user.click(screen.getByRole("button", { name: /new item/i }));
    const input = await screen.findByRole("textbox");
    await user.type(input, "Buy bread");
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(capturedBody).toMatchObject({
        type: "CreateNode",
        payload: { parentId: "p1", type: "todo", title: "Buy bread" },
      }),
    );
  });

  it("shows a New sub-project button for an open project column, and submitting it creates a project", async () => {
    stubColumn("p1", [TODO_ROW]);
    mswServer.use(
      http.get("/api/nodes/p1", () =>
        HttpResponse.json({
          id: "p1",
          type: "project",
          title: "Groceries",
          notes: "",
          whenDate: null,
          deadline: null,
          completedAt: null,
          path: [],
        }),
      ),
    );
    let capturedBody: unknown;
    mswServer.use(
      http.post("/api/commands", async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ id: "sub-1" });
      }),
    );
    const user = userEvent.setup();

    renderWithProviders(<Column parentId="p1" depth={0} />);
    await screen.findByText("Buy milk");
    await user.click(screen.getByRole("button", { name: "New sub-project" }));
    const input = await screen.findByRole("textbox");
    await user.type(input, "Frozen foods");
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(capturedBody).toMatchObject({
        type: "CreateNode",
        payload: { parentId: "p1", type: "project", title: "Frozen foods" },
      }),
    );
  });

  it("submitting a blank title from the + button's input does not create anything", async () => {
    stubColumn("p1", [TODO_ROW]);
    let called = false;
    mswServer.use(
      http.post("/api/commands", () => {
        called = true;
        return HttpResponse.json({});
      }),
    );
    const user = userEvent.setup();

    renderWithProviders(<Column parentId="p1" depth={0} />);
    await screen.findByText("Buy milk");
    await user.click(screen.getByRole("button", { name: /new item/i }));
    await user.keyboard("{Enter}");

    expect(called).toBe(false);
    expect(screen.getByRole("textbox")).toBeInTheDocument(); // input stays open
  });

  it("Escape cancels the + button's pending input without creating anything", async () => {
    stubColumn("p1", [TODO_ROW]);
    let called = false;
    mswServer.use(
      http.post("/api/commands", () => {
        called = true;
        return HttpResponse.json({});
      }),
    );
    const user = userEvent.setup();

    renderWithProviders(<Column parentId="p1" depth={0} />);
    await screen.findByText("Buy milk");
    await user.click(screen.getByRole("button", { name: /new item/i }));
    await screen.findByRole("textbox");
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(called).toBe(false);
  });

  it("does not register a whole-row drop target for todo rows", async () => {
    stubColumn("p1", [TODO_ROW]);

    renderWithProviders(<Column parentId="p1" depth={0} />);
    await screen.findByText("Buy milk");

    expect(document.querySelector('[data-droppable-id="project-drop-todo-1"]')).toBeNull();
  });
});
