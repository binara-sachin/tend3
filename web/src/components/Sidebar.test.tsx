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

  it("clicking a root project records it as the active selection, with parentId 'root'", async () => {
    mswServer.use(http.get("/api/columns/root", () => HttpResponse.json([AREA])));
    const user = userEvent.setup();

    renderWithProviders(<Sidebar />);
    await user.click(await screen.findByText("Work"));

    expect(useUiStore.getState().activeSelection).toEqual({
      parentId: "root",
      nodeId: "area-1",
      type: "project",
    });
  });

  it("mounts with focusedColumnParentId set to 'root', giving Cmd+N a target before anything is selected", async () => {
    mswServer.use(http.get("/api/columns/root", () => HttpResponse.json([])));

    renderWithProviders(<Sidebar />);
    await screen.findByText("Today");

    expect(useUiStore.getState().focusedColumnParentId).toBe("root");
  });

  it("clicking Today, Logbook, or Trash sets the active smart list instead of the open path", async () => {
    mswServer.use(http.get("/api/columns/root", () => HttpResponse.json([])));
    const user = userEvent.setup();

    renderWithProviders(<Sidebar />);

    await user.click(await screen.findByText("Today"));
    expect(useUiStore.getState().activeSmartList).toBe("today");

    await user.click(screen.getByText("Logbook"));
    expect(useUiStore.getState().activeSmartList).toBe("logbook");

    await user.click(screen.getByText("Trash"));
    expect(useUiStore.getState().activeSmartList).toBe("trash");

    expect(useUiStore.getState().openPath).toEqual([]);
  });

  it("renaming a root-level project via Enter submits RenameNode with parentId null", async () => {
    mswServer.use(http.get("/api/columns/root", () => HttpResponse.json([AREA])));
    let capturedBody: unknown;
    mswServer.use(
      http.post("/api/commands", async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ id: "area-1", title: "Renamed" });
      }),
    );
    const user = userEvent.setup();

    renderWithProviders(<Sidebar />);
    const row = await screen.findByText("Work");
    row.focus();
    await user.keyboard("{Enter}");
    const renameInput = screen.getByDisplayValue("Work");
    await user.clear(renameInput);
    await user.type(renameInput, "Renamed");
    await user.keyboard("{Enter}");

    expect(capturedBody).toEqual({
      type: "RenameNode",
      payload: { nodeId: "area-1", title: "Renamed" },
    });
  });

  it("registers Today, Inbox, and Trash as drop targets, but not Logbook (spec 6: action targets, not move targets)", async () => {
    mswServer.use(http.get("/api/columns/root", () => HttpResponse.json([INBOX, AREA])));

    renderWithProviders(<Sidebar />);
    await screen.findByText("Inbox");

    expect(document.querySelector('[data-droppable-id="sidebar-today"]')).not.toBeNull();
    expect(document.querySelector('[data-droppable-id="sidebar-inbox"]')).not.toBeNull();
    expect(document.querySelector('[data-droppable-id="sidebar-trash"]')).not.toBeNull();
    expect(document.querySelector('[data-droppable-id="sidebar-logbook"]')).toBeNull();
  });
});
