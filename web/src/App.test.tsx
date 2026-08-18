// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import "./test/setup.js";
import { mswServer } from "./test/mswServer.js";
import { renderWithProviders } from "./test/renderWithProviders.js";
import { useUiStore } from "./store/uiStore.js";
import { App } from "./App.js";

const INITIAL_UI_STATE = useUiStore.getState();

beforeEach(() => {
  useUiStore.setState(INITIAL_UI_STATE, true);
});

function row(overrides: Partial<Record<string, unknown>>) {
  return {
    id: "id",
    type: "project",
    title: "title",
    isSystem: false,
    whenDate: null,
    deadline: null,
    completedAt: null,
    isComplete: false,
    openDescendantCount: 0,
    ...overrides,
  };
}

describe("App", () => {
  it("clicking a root project in the sidebar shows its children in the column stack", async () => {
    mswServer.use(
      http.get("/api/columns/root", () => HttpResponse.json([row({ id: "p1", title: "Areas" })])),
      http.get("/api/columns/p1", () => HttpResponse.json([row({ id: "t1", type: "todo", title: "Buy milk" })])),
    );
    const user = userEvent.setup();

    renderWithProviders(<App />);
    await user.click(await screen.findByText("Areas"));

    expect(await screen.findByText("Buy milk")).toBeInTheDocument();
  });

  it("shows the detail pane when the open path's last entry is a todo", async () => {
    mswServer.use(
      http.get("/api/columns/root", () => HttpResponse.json([row({ id: "p1", title: "Areas" })])),
      http.get("/api/columns/p1", () =>
        HttpResponse.json([row({ id: "t1", type: "todo", title: "Buy milk" })]),
      ),
      http.get("/api/nodes/t1", () =>
        HttpResponse.json({
          id: "t1",
          type: "todo",
          title: "Buy milk",
          notes: "get 2%",
          whenDate: null,
          deadline: null,
          completedAt: null,
          path: [],
        }),
      ),
    );
    const user = userEvent.setup();

    renderWithProviders(<App />);
    await user.click(await screen.findByText("Areas"));
    await user.click(await screen.findByText("Buy milk"));

    expect(await screen.findByDisplayValue("get 2%")).toBeInTheDocument();
  });

  it("clicking Today in the sidebar shows the Today view instead of the column stack", async () => {
    mswServer.use(
      http.get("/api/columns/root", () => HttpResponse.json([row({ id: "p1", title: "Work" })])),
      http.get("/api/today", () =>
        HttpResponse.json([{ projectId: "p1", projectTitle: "Work", rows: [{ id: "todo-1", title: "Buy milk" }] }]),
      ),
    );
    const user = userEvent.setup();

    renderWithProviders(<App />);
    await user.click(await screen.findByText("Today"));

    expect(await screen.findByText("Buy milk")).toBeInTheDocument();
  });

  it("selecting a project afterward switches back to the column stack", async () => {
    mswServer.use(
      http.get("/api/columns/root", () => HttpResponse.json([row({ id: "p1", title: "Work" })])),
      http.get("/api/columns/p1", () => HttpResponse.json([])),
      http.get("/api/today", () => HttpResponse.json([])),
    );
    const user = userEvent.setup();

    renderWithProviders(<App />);
    await user.click(await screen.findByText("Today"));
    await screen.findByTestId("today-view");

    await user.click(screen.getByText("Work"));

    expect(await screen.findByRole("button", { name: "Show completed" })).toBeInTheDocument();
    expect(screen.queryByTestId("today-view")).not.toBeInTheDocument();
  });
});
