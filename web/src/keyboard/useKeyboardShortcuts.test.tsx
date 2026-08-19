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

  it("Space is ignored while a text input has focus (e.g. mid-rename), so typing a space doesn't toggle completion", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["columns", "p1"], [{ id: "todo-1", completedAt: null }]);
    useUiStore.getState().setActiveSelection({ parentId: "p1", nodeId: "todo-1", type: "todo" });
    let called = false;
    mswServer.use(
      http.post("/api/commands", () => {
        called = true;
        return HttpResponse.json({});
      }),
    );
    renderShortcuts(queryClient);
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    await userEvent.keyboard(" ");

    expect(called).toBe(false);
    document.body.removeChild(input);
  });

  it("Space is ignored while a textarea has focus", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["columns", "p1"], [{ id: "todo-1", completedAt: null }]);
    useUiStore.getState().setActiveSelection({ parentId: "p1", nodeId: "todo-1", type: "todo" });
    let called = false;
    mswServer.use(
      http.post("/api/commands", () => {
        called = true;
        return HttpResponse.json({});
      }),
    );
    renderShortcuts(queryClient);
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    textarea.focus();

    await userEvent.keyboard(" ");

    expect(called).toBe(false);
    document.body.removeChild(textarea);
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

  it("Cmd+Backspace is ignored while a text input has focus (macOS's native delete-to-line-start there)", async () => {
    const queryClient = new QueryClient();
    useUiStore.getState().setActiveSelection({ parentId: "p1", nodeId: "todo-1", type: "todo" });
    let called = false;
    mswServer.use(
      http.post("/api/commands", () => {
        called = true;
        return HttpResponse.json({});
      }),
    );
    renderShortcuts(queryClient);
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    await userEvent.keyboard("{Meta>}{Backspace}{/Meta}");

    expect(called).toBe(false);
    document.body.removeChild(input);
  });

  it("Cmd+N opens a blank title input inside the focused column when nothing is selected yet (e.g. an empty column)", async () => {
    const queryClient = new QueryClient();
    useUiStore.getState().setFocusedColumnParentId("p1");
    let called = false;
    mswServer.use(
      http.post("/api/commands", () => {
        called = true;
        return HttpResponse.json({});
      }),
    );
    renderShortcuts(queryClient);

    await userEvent.keyboard("{Meta>}n{/Meta}");

    expect(useUiStore.getState().creatingParentId).toBe("p1");
    expect(called).toBe(false);
  });

  it("Cmd+N at the root level (focusedColumnParentId 'root') targets root for the pending input", async () => {
    const queryClient = new QueryClient();
    useUiStore.getState().setFocusedColumnParentId("root");
    renderShortcuts(queryClient);

    await userEvent.keyboard("{Meta>}n{/Meta}");

    expect(useUiStore.getState().creatingParentId).toBe("root");
  });

  it("Cmd+N with a root-level project selected also targets root for the pending input", async () => {
    const queryClient = new QueryClient();
    useUiStore.getState().setActiveSelection({ parentId: "root", nodeId: "inbox", type: "project" });
    renderShortcuts(queryClient);

    await userEvent.keyboard("{Meta>}n{/Meta}");

    expect(useUiStore.getState().creatingParentId).toBe("root");
  });

  it("Cmd+N targets a pending sibling input below the current selection", async () => {
    const queryClient = new QueryClient();
    useUiStore.getState().setActiveSelection({ parentId: "p1", nodeId: "todo-1", type: "todo" });
    renderShortcuts(queryClient);

    await userEvent.keyboard("{Meta>}n{/Meta}");

    expect(useUiStore.getState().creatingParentId).toBe("p1");
  });

  it("Cmd+K opens the search palette", async () => {
    const queryClient = new QueryClient();
    renderShortcuts(queryClient);

    await userEvent.keyboard("{Meta>}k{/Meta}");

    expect(useUiStore.getState().isSearchOpen).toBe(true);
  });

  it("Cmd+Shift+N targets a pending child input inside the selected project", async () => {
    const queryClient = new QueryClient();
    useUiStore.getState().setActiveSelection({ parentId: "root", nodeId: "proj-1", type: "project" });
    renderShortcuts(queryClient);

    await userEvent.keyboard("{Meta>}{Shift>}n{/Shift}{/Meta}");

    expect(useUiStore.getState().creatingParentId).toBe("proj-1");
  });
});

async function captureUndo(): Promise<void> {
  return new Promise((resolve) => {
    mswServer.use(
      http.post("/api/undo", () => {
        resolve();
        return HttpResponse.json({ ok: true });
      }),
    );
  });
}

async function captureRedo(): Promise<void> {
  return new Promise((resolve) => {
    mswServer.use(
      http.post("/api/redo", () => {
        resolve();
        return HttpResponse.json({ ok: true });
      }),
    );
  });
}

describe("useKeyboardShortcuts — undo/redo", () => {
  it("Cmd+Z posts to /api/undo", async () => {
    const queryClient = new QueryClient();
    const calledPromise = captureUndo();
    renderShortcuts(queryClient);

    await userEvent.keyboard("{Meta>}z{/Meta}");

    await calledPromise;
  });

  it("Cmd+Shift+Z posts to /api/redo", async () => {
    const queryClient = new QueryClient();
    const calledPromise = captureRedo();
    renderShortcuts(queryClient);

    await userEvent.keyboard("{Meta>}{Shift>}z{/Shift}{/Meta}");

    await calledPromise;
  });

  it("Cmd+Z is ignored while a text input has focus", async () => {
    const queryClient = new QueryClient();
    let called = false;
    mswServer.use(
      http.post("/api/undo", () => {
        called = true;
        return HttpResponse.json({ ok: true });
      }),
    );
    renderShortcuts(queryClient);
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    await userEvent.keyboard("{Meta>}z{/Meta}");

    expect(called).toBe(false);
    document.body.removeChild(input);
  });

  it("Cmd+Z is ignored while a textarea has focus", async () => {
    const queryClient = new QueryClient();
    let called = false;
    mswServer.use(
      http.post("/api/undo", () => {
        called = true;
        return HttpResponse.json({ ok: true });
      }),
    );
    renderShortcuts(queryClient);
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    textarea.focus();

    await userEvent.keyboard("{Meta>}z{/Meta}");

    expect(called).toBe(false);
    document.body.removeChild(textarea);
  });
});
