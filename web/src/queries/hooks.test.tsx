// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import "../test/setup.js";
import { mswServer } from "../test/mswServer.js";
import { useUiStore } from "../store/uiStore.js";
import { useColumn, useNode, useRedo, useRunCommand, useUndo } from "./hooks.js";

const INITIAL_UI_STATE = useUiStore.getState();

beforeEach(() => {
  useUiStore.setState(INITIAL_UI_STATE, true);
});

function wrapperWith(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useColumn", () => {
  it("resolves to the fetched column rows", async () => {
    mswServer.use(
      http.get("/api/columns/p1", () =>
        HttpResponse.json([{ id: "x", type: "todo", title: "Buy milk" }]),
      ),
    );
    const queryClient = new QueryClient();

    const { result } = renderHook(() => useColumn("p1"), { wrapper: wrapperWith(queryClient) });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.[0]?.title).toBe("Buy milk");
  });
});

describe("useNode", () => {
  it("resolves to the fetched node detail", async () => {
    mswServer.use(http.get("/api/nodes/x", () => HttpResponse.json({ id: "x", title: "Buy milk" })));
    const queryClient = new QueryClient();

    const { result } = renderHook(() => useNode("x"), { wrapper: wrapperWith(queryClient) });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.title).toBe("Buy milk");
  });

  it("does not fetch when id is null", () => {
    const queryClient = new QueryClient();

    const { result } = renderHook(() => useNode(null), { wrapper: wrapperWith(queryClient) });

    expect(result.current.fetchStatus).toBe("idle");
  });
});

describe("useRunCommand", () => {
  it("invalidates the mutated node's column and every column currently in the open path", async () => {
    mswServer.use(http.post("/api/commands", () => HttpResponse.json({ id: "x" })));
    const queryClient = new QueryClient();
    queryClient.setQueryData(["columns", "p1"], []);
    queryClient.setQueryData(["columns", "ancestor1"], []);
    queryClient.setQueryData(["columns", "unrelated"], []);
    useUiStore.getState().select(0, { id: "ancestor1", type: "project" });

    const { result } = renderHook(() => useRunCommand(), { wrapper: wrapperWith(queryClient) });

    result.current.mutate({ type: "RenameNode", payload: { nodeId: "x", title: "new" }, parentId: "p1" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryState(["columns", "p1"])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(["columns", "ancestor1"])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(["columns", "unrelated"])?.isInvalidated).toBe(false);
  });

  it("also invalidates the currently-open node's detail query when the open path ends on a todo", async () => {
    mswServer.use(http.post("/api/commands", () => HttpResponse.json({ id: "x" })));
    const queryClient = new QueryClient();
    queryClient.setQueryData(["node", "todo-1"], { id: "todo-1" });
    useUiStore.getState().select(0, { id: "p1", type: "project" });
    useUiStore.getState().select(1, { id: "todo-1", type: "todo" });

    const { result } = renderHook(() => useRunCommand(), { wrapper: wrapperWith(queryClient) });
    result.current.mutate({ type: "SetNotes", payload: { nodeId: "todo-1", notes: "x" }, parentId: "p1" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryState(["node", "todo-1"])?.isInvalidated).toBe(true);
  });
});

describe("useUndo", () => {
  it("invalidates every open-path column, the smart lists, and the open node on success", async () => {
    mswServer.use(http.post("/api/undo", () => HttpResponse.json({ ok: true })));
    const queryClient = new QueryClient();
    queryClient.setQueryData(["columns", "p1"], []);
    queryClient.setQueryData(["today"], []);
    queryClient.setQueryData(["node", "todo-1"], { id: "todo-1" });
    useUiStore.getState().select(0, { id: "p1", type: "project" });
    useUiStore.getState().select(1, { id: "todo-1", type: "todo" });

    const { result } = renderHook(() => useUndo(), { wrapper: wrapperWith(queryClient) });
    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryState(["columns", "p1"])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(["today"])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(["node", "todo-1"])?.isInvalidated).toBe(true);
  });
});

describe("useRedo", () => {
  it("invalidates the same broad set of queries on success", async () => {
    mswServer.use(http.post("/api/redo", () => HttpResponse.json({ ok: true })));
    const queryClient = new QueryClient();
    queryClient.setQueryData(["trash"], []);
    useUiStore.getState().select(0, { id: "p1", type: "project" });

    const { result } = renderHook(() => useRedo(), { wrapper: wrapperWith(queryClient) });
    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryState(["trash"])?.isInvalidated).toBe(true);
  });
});
