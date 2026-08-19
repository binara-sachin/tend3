// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { act } from "react";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
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
