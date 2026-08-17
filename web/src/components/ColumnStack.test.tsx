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
  it("renders the root column plus one column per project entry in the open path", async () => {
    mswServer.use(
      http.get("/api/columns/root", () => HttpResponse.json([row({ id: "p1", title: "Areas" })])),
      http.get("/api/columns/p1", () => HttpResponse.json([row({ id: "p2", title: "Groceries" })])),
    );
    useUiStore.getState().select(0, { id: "p1", type: "project" });

    renderWithProviders(<ColumnStack />);

    expect(await screen.findByText("Areas")).toBeInTheDocument();
    expect(await screen.findByText("Groceries")).toBeInTheDocument();
  });

  it("selecting a project extends the stack by one column", async () => {
    mswServer.use(
      http.get("/api/columns/root", () => HttpResponse.json([row({ id: "p1", title: "Areas" })])),
      http.get("/api/columns/p1", () => HttpResponse.json([row({ id: "p2", title: "Groceries" })])),
    );
    const user = userEvent.setup();

    renderWithProviders(<ColumnStack />);
    await user.click(await screen.findByText("Areas"));

    expect(await screen.findByText("Groceries")).toBeInTheDocument();
  });

  it("re-selecting at an earlier column truncates later columns", async () => {
    mswServer.use(
      http.get("/api/columns/root", () =>
        HttpResponse.json([row({ id: "p1", title: "Areas" }), row({ id: "p1b", title: "Work" })]),
      ),
      http.get("/api/columns/p1", () => HttpResponse.json([row({ id: "p2", title: "Groceries" })])),
      http.get("/api/columns/p1b", () => HttpResponse.json([row({ id: "p3", title: "Reports" })])),
    );
    const user = userEvent.setup();

    renderWithProviders(<ColumnStack />);
    await user.click(await screen.findByText("Areas"));
    await screen.findByText("Groceries");

    await user.click(screen.getByText("Work"));

    expect(await screen.findByText("Reports")).toBeInTheDocument();
    expect(screen.queryByText("Groceries")).not.toBeInTheDocument();
  });

  it("dragging a column's divider updates its stored width", async () => {
    mswServer.use(http.get("/api/columns/root", () => HttpResponse.json([])));

    renderWithProviders(<ColumnStack />);
    const divider = await screen.findByRole("separator");

    divider.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, clientX: 100, pointerId: 1 }),
    );
    window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 150, pointerId: 1 }));
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: 150, pointerId: 1 }));

    expect(useUiStore.getState().columnWidths[0]).toBe(330); // default 280 + 50px delta
  });
});
