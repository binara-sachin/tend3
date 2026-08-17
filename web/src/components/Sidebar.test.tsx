// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import "../test/setup.js";
import { mswServer } from "../test/mswServer.js";
import { renderWithProviders } from "../test/renderWithProviders.js";
import { useUiStore } from "../store/uiStore.js";
import { Sidebar } from "./Sidebar.js";

const INITIAL_UI_STATE = useUiStore.getState();

beforeEach(() => {
  useUiStore.setState(INITIAL_UI_STATE, true);
});

const INBOX = {
  id: "inbox",
  type: "project",
  title: "Inbox",
  isSystem: true,
  whenDate: null,
  deadline: null,
  completedAt: null,
  isComplete: false,
  openDescendantCount: 0,
};

const AREA = { ...INBOX, id: "area-1", title: "Work", isSystem: false };

describe("Sidebar", () => {
  it("renders Inbox and root-level projects", async () => {
    mswServer.use(http.get("/api/columns/root", () => HttpResponse.json([INBOX, AREA])));

    renderWithProviders(<Sidebar />);

    expect(await screen.findByText("Inbox")).toBeInTheDocument();
    expect(screen.getByText("Work")).toBeInTheDocument();
  });

  it("clicking a root project selects it at depth 0", async () => {
    mswServer.use(http.get("/api/columns/root", () => HttpResponse.json([AREA])));
    const user = userEvent.setup();

    renderWithProviders(<Sidebar />);
    await user.click(await screen.findByText("Work"));

    expect(useUiStore.getState().openPath).toEqual([{ id: "area-1", type: "project" }]);
  });

  it("renders Today, Logbook, and Trash as inert placeholders", async () => {
    mswServer.use(http.get("/api/columns/root", () => HttpResponse.json([])));
    const user = userEvent.setup();

    renderWithProviders(<Sidebar />);
    await user.click(await screen.findByText("Today"));
    await user.click(screen.getByText("Logbook"));
    await user.click(screen.getByText("Trash"));

    expect(useUiStore.getState().openPath).toEqual([]);
  });
});
