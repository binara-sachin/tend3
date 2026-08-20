// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { act } from "react";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../test/setup.js";
import { mswServer } from "../test/mswServer.js";
import { useUiStore } from "../store/uiStore.js";
import { useCreateNode, useSubmitNewNode } from "./useCreateNode.js";

const INITIAL_UI_STATE = useUiStore.getState();

beforeEach(() => {
  useUiStore.setState(INITIAL_UI_STATE, true);
});

function renderWithClient<T>(hook: () => T, queryClient: QueryClient) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return renderHook(hook, { wrapper: Wrapper });
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

describe("useCreateNode", () => {
  it("starts the create flow by recording the target parent, without creating anything", async () => {
    let called = false;
    mswServer.use(
      http.post("/api/commands", () => {
        called = true;
        return HttpResponse.json({});
      }),
    );
    const queryClient = new QueryClient();
    const { result } = renderWithClient(() => useCreateNode(), queryClient);

    act(() => result.current("p1"));

    expect(useUiStore.getState().creatingParentId).toBe("p1");
    expect(called).toBe(false);
  });
});

describe("useSubmitNewNode", () => {
  it("creates a project at the root with the given title, and closes the pending input", async () => {
    useUiStore.getState().setCreatingParentId("root");
    const queryClient = new QueryClient();
    const bodyPromise = capturePost();
    const { result } = renderWithClient(() => useSubmitNewNode(), queryClient);

    act(() => result.current("root", "Areas"));

    expect(await bodyPromise).toEqual({
      type: "CreateNode",
      payload: {
        parentId: null,
        type: "project",
        title: "Areas",
        notes: "",
        sortKey: expect.any(String),
        whenDate: null,
        deadline: null,
      },
    });
    expect(useUiStore.getState().creatingParentId).toBeNull();
  });

  it("creates a todo inside a non-root parent", async () => {
    const queryClient = new QueryClient();
    const bodyPromise = capturePost();
    const { result } = renderWithClient(() => useSubmitNewNode(), queryClient);

    act(() => result.current("p1", "Buy milk"));

    const body = (await bodyPromise) as { payload: { parentId: string; type: string; title: string } };
    expect(body.payload.parentId).toBe("p1");
    expect(body.payload.type).toBe("todo");
    expect(body.payload.title).toBe("Buy milk");
  });

  it("sorts the new node after the target's last existing child", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["columns", "p1"], [{ id: "a", sortKey: "a0" }]);
    const bodyPromise = capturePost();
    const { result } = renderWithClient(() => useSubmitNewNode(), queryClient);

    act(() => result.current("p1", "Buy milk"));

    const body = (await bodyPromise) as { payload: { sortKey: string } };
    expect(body.payload.sortKey > "a0").toBe(true);
  });

  it("trims surrounding whitespace off the title before sending", async () => {
    const queryClient = new QueryClient();
    const bodyPromise = capturePost();
    const { result } = renderWithClient(() => useSubmitNewNode(), queryClient);

    act(() => result.current("p1", "  Buy milk  "));

    const body = (await bodyPromise) as { payload: { title: string } };
    expect(body.payload.title).toBe("Buy milk");
  });

  it("reports the error and closes the pending input instead of getting stuck, when the last sibling's sortKey is corrupt", async () => {
    useUiStore.getState().setCreatingParentId("p1");
    let called = false;
    mswServer.use(
      http.post("/api/commands", () => {
        called = true;
        return HttpResponse.json({});
      }),
    );
    const queryClient = new QueryClient();
    // A malformed sortKey (e.g. written directly rather than via
    // firstSortKey/sortKeyAfter) makes fractional-indexing throw when asked
    // for a key after it.
    queryClient.setQueryData(["columns", "p1"], [{ id: "a", sortKey: "z1787202573623" }]);
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const { result } = renderWithClient(() => useSubmitNewNode(), queryClient);

    act(() => result.current("p1", "Buy milk"));

    expect(called).toBe(false);
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(useUiStore.getState().creatingParentId).toBeNull();
    alertSpy.mockRestore();
  });

  it("reports the error when the server rejects the command", async () => {
    mswServer.use(
      http.post("/api/commands", () => HttpResponse.json({ error: "sortKey collision" }, { status: 400 })),
    );
    const queryClient = new QueryClient();
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const { result } = renderWithClient(() => useSubmitNewNode(), queryClient);

    act(() => result.current("p1", "Buy milk"));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Couldn\'t create "Buy milk": sortKey collision'));
    alertSpy.mockRestore();
  });

  it("does nothing for a blank title, leaving the pending input open", async () => {
    useUiStore.getState().setCreatingParentId("p1");
    let called = false;
    mswServer.use(
      http.post("/api/commands", () => {
        called = true;
        return HttpResponse.json({});
      }),
    );
    const queryClient = new QueryClient();
    const { result } = renderWithClient(() => useSubmitNewNode(), queryClient);

    act(() => result.current("p1", "   "));

    expect(called).toBe(false);
    expect(useUiStore.getState().creatingParentId).toBe("p1");
  });
});
