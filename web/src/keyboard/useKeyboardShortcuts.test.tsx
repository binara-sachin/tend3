// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import "../test/setup.js";
import { mswServer } from "../test/mswServer.js";
import { useUiStore } from "../store/uiStore.js";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts.js";

const INITIAL_UI_STATE = useUiStore.getState();

beforeEach(() => {
  useUiStore.setState(INITIAL_UI_STATE, true);
});

function renderShortcuts(queryClient: QueryClient) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return renderHook(() => useKeyboardShortcuts(), { wrapper: Wrapper });
}

async function capturePost(): Promise<Promise<unknown>> {
  return new Promise((resolve) => {
    mswServer.use(
      http.post("/api/commands", async ({ request }) => {
        const body = await request.json();
        resolve(body);
        return HttpResponse.json({ id: "x" });
      }),
    );
  });
}

describe("useKeyboardShortcuts", () => {
  it("Space toggles completion on the selected todo (marking it complete)", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["columns", "p1"], [{ id: "todo-1", completedAt: null }]);
    useUiStore.getState().setActiveSelection({ parentId: "p1", nodeId: "todo-1", type: "todo" });
    const bodyPromise = capturePost();
    renderShortcuts(queryClient);

    await userEvent.keyboard(" ");

    expect(await bodyPromise).toEqual({
      type: "SetCompleted",
      payload: { nodeId: "todo-1", completed: true },
    });
  });

  it("Space on an already-completed todo un-completes it", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["columns", "p1"], [{ id: "todo-1", completedAt: "2024-01-01" }]);
    useUiStore.getState().setActiveSelection({ parentId: "p1", nodeId: "todo-1", type: "todo" });
    const bodyPromise = capturePost();
    renderShortcuts(queryClient);

    await userEvent.keyboard(" ");

    expect(await bodyPromise).toEqual({
      type: "SetCompleted",
      payload: { nodeId: "todo-1", completed: false },
    });
  });

  it("Space does nothing when the selection is a project", async () => {
    const queryClient = new QueryClient();
    useUiStore.getState().setActiveSelection({ parentId: "p1", nodeId: "proj-1", type: "project" });
    let called = false;
    mswServer.use(
      http.post("/api/commands", () => {
        called = true;
        return HttpResponse.json({});
      }),
    );
    renderShortcuts(queryClient);

    await userEvent.keyboard(" ");

    expect(called).toBe(false);
  });

  it("Cmd+Backspace trashes the current selection", async () => {
    const queryClient = new QueryClient();
    useUiStore.getState().setActiveSelection({ parentId: "p1", nodeId: "todo-1", type: "todo" });
    const bodyPromise = capturePost();
    renderShortcuts(queryClient);

    await userEvent.keyboard("{Meta>}{Backspace}{/Meta}");

    expect(await bodyPromise).toEqual({
      type: "TrashNode",
      payload: { nodeId: "todo-1" },
    });
  });

  it("Cmd+N creates inside the focused column when nothing is selected yet (e.g. an empty column)", async () => {
    const queryClient = new QueryClient();
    useUiStore.getState().setFocusedColumnParentId("p1");
    const bodyPromise = capturePost();
    renderShortcuts(queryClient);

    await userEvent.keyboard("{Meta>}n{/Meta}");

    const body = (await bodyPromise) as { type: string; payload: { parentId: string } };
    expect(body.type).toBe("CreateNode");
    expect(body.payload.parentId).toBe("p1");
  });

  it("Cmd+N creates a sibling below the current selection", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["columns", "p1"], [{ id: "todo-1", sortKey: "a0" }]);
    useUiStore.getState().setActiveSelection({ parentId: "p1", nodeId: "todo-1", type: "todo" });
    const bodyPromise = capturePost();
    renderShortcuts(queryClient);

    await userEvent.keyboard("{Meta>}n{/Meta}");

    const body = (await bodyPromise) as { type: string; payload: { parentId: string; type: string } };
    expect(body.type).toBe("CreateNode");
    expect(body.payload.parentId).toBe("p1");
    expect(body.payload.type).toBe("todo");
  });

  it("Cmd+K opens the search palette", async () => {
    const queryClient = new QueryClient();
    renderShortcuts(queryClient);

    await userEvent.keyboard("{Meta>}k{/Meta}");

    expect(useUiStore.getState().isSearchOpen).toBe(true);
  });

  it("Cmd+Shift+N creates a child inside the selected project", async () => {
    const queryClient = new QueryClient();
    useUiStore.getState().setActiveSelection({ parentId: "root", nodeId: "proj-1", type: "project" });
    const bodyPromise = capturePost();
    renderShortcuts(queryClient);

    await userEvent.keyboard("{Meta>}{Shift>}n{/Shift}{/Meta}");

    const body = (await bodyPromise) as { type: string; payload: { parentId: string } };
    expect(body.type).toBe("CreateNode");
    expect(body.payload.parentId).toBe("proj-1");
  });
});
