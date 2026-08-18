// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import "../test/setup.js";
import { mswServer } from "../test/mswServer.js";
import { renderWithProviders } from "../test/renderWithProviders.js";
import { useUiStore } from "../store/uiStore.js";
import { SearchPalette } from "./SearchPalette.js";

const INITIAL_UI_STATE = useUiStore.getState();

beforeEach(() => {
  useUiStore.setState(INITIAL_UI_STATE, true);
});

describe("SearchPalette", () => {
  it("renders nothing when closed", () => {
    const { container } = renderWithProviders(<SearchPalette />);

    expect(container).toBeEmptyDOMElement();
  });

  it("shows results as the user types (debounced)", async () => {
    useUiStore.getState().setSearchOpen(true);
    mswServer.use(
      http.get("/api/search", ({ request }) => {
        const q = new URL(request.url).searchParams.get("q");
        if (q !== "mil") return HttpResponse.json([]);
        return HttpResponse.json([
          { id: "todo-1", type: "todo", title: "Buy milk", notes: "", path: [] },
        ]);
      }),
    );
    const user = userEvent.setup();

    renderWithProviders(<SearchPalette />);
    await user.type(screen.getByRole("textbox"), "mil");

    expect(await screen.findByText("Buy milk")).toBeInTheDocument();
  });

  it("Enter on a result opens its full column path and closes the palette", async () => {
    useUiStore.getState().setSearchOpen(true);
    mswServer.use(
      http.get("/api/search", () =>
        HttpResponse.json([
          {
            id: "todo-1",
            type: "todo",
            title: "Buy milk",
            notes: "",
            path: [
              { id: "heading-1", type: "heading" },
              { id: "p1", type: "project" },
            ],
          },
        ]),
      ),
    );
    const user = userEvent.setup();

    renderWithProviders(<SearchPalette />);
    await user.type(screen.getByRole("textbox"), "milk");
    await screen.findByText("Buy milk");
    await user.keyboard("{Enter}");

    expect(useUiStore.getState().openPath).toEqual([
      { id: "p1", type: "project" },
      { id: "todo-1", type: "todo" },
    ]);
    expect(useUiStore.getState().isSearchOpen).toBe(false);
  });

  it("Enter on a result also expands any heading ancestor in its path", async () => {
    useUiStore.getState().setSearchOpen(true);
    mswServer.use(
      http.get("/api/search", () =>
        HttpResponse.json([
          {
            id: "todo-1",
            type: "todo",
            title: "Buy milk",
            notes: "",
            path: [
              { id: "heading-1", type: "heading" },
              { id: "p1", type: "project" },
            ],
          },
        ]),
      ),
    );
    const user = userEvent.setup();

    renderWithProviders(<SearchPalette />);
    await user.type(screen.getByRole("textbox"), "milk");
    await screen.findByText("Buy milk");
    await user.keyboard("{Enter}");

    expect(useUiStore.getState().expandedHeadings["heading-1"]).toBe(true);
  });

  it("Escape closes the palette without changing the open path", async () => {
    useUiStore.getState().setSearchOpen(true);
    mswServer.use(http.get("/api/search", () => HttpResponse.json([])));
    const user = userEvent.setup();

    renderWithProviders(<SearchPalette />);
    const before = useUiStore.getState().openPath;
    await user.type(screen.getByRole("textbox"), "milk");
    await user.keyboard("{Escape}");

    expect(useUiStore.getState().isSearchOpen).toBe(false);
    expect(useUiStore.getState().openPath).toBe(before);
  });
});
