// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import "../test/setup.js";
import { mswServer } from "../test/mswServer.js";
import { renderWithProviders } from "../test/renderWithProviders.js";
import { useUiStore } from "../store/uiStore.js";
import { ColumnStack } from "./ColumnStack.js";

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

describe("ColumnStack", () => {
  it("renders nothing when the open path is empty (the sidebar covers depth 0)", () => {
    renderWithProviders(<ColumnStack />);

    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
  });

  it("renders one column per project entry in the open path, starting at the first selection's children", async () => {
    mswServer.use(
      http.get("/api/columns/p1", () => HttpResponse.json([row({ id: "p2", title: "Groceries" })])),
      http.get("/api/columns/p2", () => HttpResponse.json([row({ id: "p3", title: "Frozen" })])),
    );
    useUiStore.getState().select(0, { id: "p1", type: "project" });
    useUiStore.getState().select(1, { id: "p2", type: "project" });

    renderWithProviders(<ColumnStack />);

    expect(await screen.findByText("Groceries")).toBeInTheDocument();
    expect(await screen.findByText("Frozen")).toBeInTheDocument();
  });

  it("selecting a project extends the stack by one column", async () => {
    mswServer.use(
      http.get("/api/columns/p1", () => HttpResponse.json([row({ id: "p2", title: "Groceries" })])),
      http.get("/api/columns/p2", () => HttpResponse.json([row({ id: "p3", title: "Frozen" })])),
    );
    useUiStore.getState().select(0, { id: "p1", type: "project" });
    const user = userEvent.setup();

    renderWithProviders(<ColumnStack />);
    await user.click(await screen.findByText("Groceries"));

    expect(await screen.findByText("Frozen")).toBeInTheDocument();
  });

  it("re-selecting at an earlier column truncates later columns", async () => {
    mswServer.use(
      http.get("/api/columns/p1", () =>
        HttpResponse.json([row({ id: "p2", title: "Groceries" }), row({ id: "p2b", title: "Work" })]),
      ),
      http.get("/api/columns/p2", () => HttpResponse.json([row({ id: "p3", title: "Frozen" })])),
      http.get("/api/columns/p2b", () => HttpResponse.json([row({ id: "p4", title: "Reports" })])),
    );
    useUiStore.getState().select(0, { id: "p1", type: "project" });
    const user = userEvent.setup();

    renderWithProviders(<ColumnStack />);
    await user.click(await screen.findByText("Groceries"));
    await screen.findByText("Frozen");

    await user.click(screen.getByText("Work"));

    expect(await screen.findByText("Reports")).toBeInTheDocument();
    expect(screen.queryByText("Frozen")).not.toBeInTheDocument();
  });

  it("dragging a column's divider updates its stored width", async () => {
    mswServer.use(http.get("/api/columns/p1", () => HttpResponse.json([])));
    useUiStore.getState().select(0, { id: "p1", type: "project" });

    renderWithProviders(<ColumnStack />);
    const divider = await screen.findByRole("separator");

    divider.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, clientX: 100, pointerId: 1 }),
    );
    window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 150, pointerId: 1 }));
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: 150, pointerId: 1 }));

    expect(useUiStore.getState().columnWidths[1]).toBe(330); // default 280 + 50px delta (depth 1: sidebar owns depth 0)
  });

  it("ArrowRight/ArrowLeft moves focus between adjacent columns", async () => {
    mswServer.use(
      http.get("/api/columns/p1", () => HttpResponse.json([row({ id: "p2", title: "Groceries" })])),
      http.get("/api/columns/p2", () => HttpResponse.json([row({ id: "p3", title: "Frozen" })])),
    );
    useUiStore.getState().select(0, { id: "p1", type: "project" });
    useUiStore.getState().select(1, { id: "p2", type: "project" });
    const user = userEvent.setup();

    renderWithProviders(<ColumnStack />);
    const groceries = await screen.findByText("Groceries");
    const frozen = await screen.findByText("Frozen");
    groceries.focus();

    await user.keyboard("{ArrowRight}");
    expect(frozen).toHaveFocus();

    await user.keyboard("{ArrowLeft}");
    expect(groceries).toHaveFocus();
  });
});
