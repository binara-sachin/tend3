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

  it("Enter on a row enters inline rename, and Enter again submits RenameNode", async () => {
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
    row.focus();
    await user.keyboard("{Enter}");

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
});
