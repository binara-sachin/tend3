// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { act } from "react";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import "../test/setup.js";
import { mswServer } from "../test/mswServer.js";
import { useCreateNode } from "./useCreateNode.js";

function renderCreateNode(queryClient: QueryClient) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return renderHook(() => useCreateNode(), { wrapper: Wrapper });
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
  it("creates a blank-titled project at the root", async () => {
    const queryClient = new QueryClient();
    const bodyPromise = capturePost();
    const { result } = renderCreateNode(queryClient);

    act(() => result.current("root"));

    expect(await bodyPromise).toEqual({
      type: "CreateNode",
      payload: {
        parentId: null,
        type: "project",
        title: "",
        notes: "",
        sortKey: expect.any(String),
        whenDate: null,
        deadline: null,
      },
    });
  });

  it("creates a blank-titled todo inside a non-root parent", async () => {
    const queryClient = new QueryClient();
    const bodyPromise = capturePost();
    const { result } = renderCreateNode(queryClient);

    act(() => result.current("p1"));

    const body = (await bodyPromise) as { payload: { parentId: string; type: string } };
    expect(body.payload.parentId).toBe("p1");
    expect(body.payload.type).toBe("todo");
  });

  it("sorts the new node after the target's last existing child", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["columns", "p1"], [{ id: "a", sortKey: "a0" }]);
    const bodyPromise = capturePost();
    const { result } = renderCreateNode(queryClient);

    act(() => result.current("p1"));

    const body = (await bodyPromise) as { payload: { sortKey: string } };
    expect(body.payload.sortKey > "a0").toBe(true);
  });
});
