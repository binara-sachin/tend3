// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import "../test/setup.js";
import { mswServer } from "../test/mswServer.js";
import { renderWithProviders } from "../test/renderWithProviders.js";
import { DetailPane } from "./DetailPane.js";

const NODE = {
  id: "todo-1",
  type: "todo",
  title: "Buy milk",
  notes: "2%",
  whenDate: "2024-06-01",
  deadline: null,
  completedAt: null,
  path: [{ id: "p1", type: "project", title: "Work" }],
};

describe("DetailPane", () => {
  it("renders the node's notes, when, and deadline", async () => {
    mswServer.use(http.get("/api/nodes/todo-1", () => HttpResponse.json(NODE)));

    renderWithProviders(<DetailPane nodeId="todo-1" parentId="p1" />);

    expect(await screen.findByDisplayValue("2%")).toBeInTheDocument();
    expect(screen.getByLabelText(/when/i)).toHaveValue("2024-06-01");
    expect(screen.getByLabelText(/deadline/i)).toHaveValue("");
  });

  it("submits SetNotes when the notes textarea is blurred after editing", async () => {
    mswServer.use(http.get("/api/nodes/todo-1", () => HttpResponse.json(NODE)));
    let capturedBody: unknown;
    mswServer.use(
      http.post("/api/commands", async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(NODE);
      }),
    );
    const user = userEvent.setup();

    renderWithProviders(<DetailPane nodeId="todo-1" parentId="p1" />);
    const notes = await screen.findByDisplayValue("2%");
    await user.clear(notes);
    await user.type(notes, "whole milk");
    await user.tab();

    await waitFor(() =>
      expect(capturedBody).toEqual({
        type: "SetNotes",
        payload: { nodeId: "todo-1", notes: "whole milk" },
      }),
    );
  });

  it("submits SetWhen when the when date input changes", async () => {
    mswServer.use(http.get("/api/nodes/todo-1", () => HttpResponse.json(NODE)));
    let capturedBody: unknown;
    mswServer.use(
      http.post("/api/commands", async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(NODE);
      }),
    );
    const user = userEvent.setup();

    renderWithProviders(<DetailPane nodeId="todo-1" parentId="p1" />);
    const when = await screen.findByLabelText(/when/i);
    await user.clear(when);
    await user.type(when, "2024-07-01");
    await user.tab();

    await waitFor(() =>
      expect(capturedBody).toEqual({
        type: "SetWhen",
        payload: { nodeId: "todo-1", whenDate: "2024-07-01" },
      }),
    );
  });

  it("resets its local notes override when the underlying node's notes change (e.g. after an undo)", async () => {
    mswServer.use(http.get("/api/nodes/todo-1", () => HttpResponse.json(NODE)));
    const user = userEvent.setup();

    const { queryClient } = renderWithProviders(<DetailPane nodeId="todo-1" parentId="p1" />);
    const notes = await screen.findByDisplayValue("2%");
    await user.clear(notes);
    await user.type(notes, "whole milk");
    expect(await screen.findByDisplayValue("whole milk")).toBeInTheDocument();

    mswServer.use(
      http.get("/api/nodes/todo-1", () => HttpResponse.json({ ...NODE, notes: "reverted by undo" })),
    );
    await queryClient.invalidateQueries({ queryKey: ["node", "todo-1"] });

    expect(await screen.findByDisplayValue("reverted by undo")).toBeInTheDocument();
  });

  it("resets its local when/deadline overrides when the underlying node's dates change (e.g. after an undo)", async () => {
    mswServer.use(http.get("/api/nodes/todo-1", () => HttpResponse.json(NODE)));
    mswServer.use(http.post("/api/commands", () => HttpResponse.json(NODE)));
    const user = userEvent.setup();

    const { queryClient } = renderWithProviders(<DetailPane nodeId="todo-1" parentId="p1" />);
    const when = await screen.findByLabelText(/when/i);
    await user.clear(when);
    await user.type(when, "2024-07-01");
    expect(when).toHaveValue("2024-07-01");

    const deadline = screen.getByLabelText(/deadline/i);
    await user.clear(deadline);
    await user.type(deadline, "2024-08-01");
    expect(deadline).toHaveValue("2024-08-01");

    // Distinct from both the original fixture (2024-06-01 / null) and what
    // was just typed (2024-07-01 / 2024-08-01) — otherwise the query value
    // "changing" back to what it already was wouldn't move the needle on
    // the effect's dependency array at all (same string, same reference).
    mswServer.use(
      http.get("/api/nodes/todo-1", () =>
        HttpResponse.json({ ...NODE, whenDate: "2024-09-01", deadline: "2024-10-01" }),
      ),
    );
    await queryClient.invalidateQueries({ queryKey: ["node", "todo-1"] });

    await waitFor(() => expect(screen.getByLabelText(/when/i)).toHaveValue("2024-09-01"));
    expect(screen.getByLabelText(/deadline/i)).toHaveValue("2024-10-01");
  });

  it("double-clicking the title enters inline rename, and Enter submits RenameNode", async () => {
    mswServer.use(http.get("/api/nodes/todo-1", () => HttpResponse.json(NODE)));
    let capturedBody: unknown;
    mswServer.use(
      http.post("/api/commands", async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ ...NODE, title: "Buy oat milk" });
      }),
    );
    const user = userEvent.setup();

    renderWithProviders(<DetailPane nodeId="todo-1" parentId="p1" />);
    const title = await screen.findByText("Buy milk");
    await user.dblClick(title);

    const input = await screen.findByDisplayValue("Buy milk");
    await user.clear(input);
    await user.type(input, "Buy oat milk");
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(capturedBody).toEqual({
        type: "RenameNode",
        payload: { nodeId: "todo-1", title: "Buy oat milk" },
      }),
    );
  });

  it("blurring the title input commits the rename, and Escape cancels without submitting", async () => {
    mswServer.use(http.get("/api/nodes/todo-1", () => HttpResponse.json(NODE)));
    let called = false;
    mswServer.use(
      http.post("/api/commands", () => {
        called = true;
        return HttpResponse.json(NODE);
      }),
    );
    const user = userEvent.setup();

    renderWithProviders(<DetailPane nodeId="todo-1" parentId="p1" />);
    const title = await screen.findByText("Buy milk");
    await user.dblClick(title);
    const input = await screen.findByDisplayValue("Buy milk");
    await user.type(input, " 2%"); // -> "Buy milk 2%"
    await user.keyboard("{Escape}");

    expect(called).toBe(false);
    expect(screen.getByText("Buy milk")).toBeInTheDocument();
  });

  it("hides itself once its node is gone for good (e.g. purged) instead of showing stale content", async () => {
    mswServer.use(http.get("/api/nodes/todo-1", () => HttpResponse.json(NODE)));

    const { queryClient } = renderWithProviders(<DetailPane nodeId="todo-1" parentId="p1" />);
    await screen.findByDisplayValue("2%");

    mswServer.use(
      http.get("/api/nodes/todo-1", () =>
        HttpResponse.json({ error: "node todo-1 not found" }, { status: 404 }),
      ),
    );
    await queryClient.invalidateQueries({ queryKey: ["node", "todo-1"] });

    await waitFor(() => expect(screen.queryByDisplayValue("2%")).not.toBeInTheDocument());
  });
});
