// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import "../test/setup.js";
import { mswServer } from "../test/mswServer.js";
import { renderWithProviders } from "../test/renderWithProviders.js";
import { TrashView } from "./TrashView.js";

function row(overrides: Partial<Record<string, unknown>>) {
  return {
    id: "id",
    type: "project",
    title: "title",
    isSystem: false,
    whenDate: null,
    deadline: null,
    completedAt: null,
    isComplete: false,
    openDescendantCount: 0,
    deletedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("TrashView", () => {
  it("lists trashed roots with Restore, Permanently delete, and a page-level Empty Trash action", async () => {
    mswServer.use(
      http.get("/api/trash", () => HttpResponse.json([row({ id: "t1", title: "Old project" })])),
    );

    renderWithProviders(<TrashView />);

    expect(await screen.findByText("Old project")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Permanently delete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Empty Trash" })).toBeInTheDocument();
  });

  it("restoring a row issues a RestoreNode command for its id", async () => {
    mswServer.use(
      http.get("/api/trash", () => HttpResponse.json([row({ id: "t1", title: "Old project" })])),
    );
    let received: unknown;
    mswServer.use(
      http.post("/api/commands", async ({ request }) => {
        received = await request.json();
        return HttpResponse.json(null);
      }),
    );
    const user = userEvent.setup();

    renderWithProviders(<TrashView />);
    await user.click(await screen.findByRole("button", { name: "Restore" }));

    await vi.waitFor(() =>
      expect(received).toEqual({ type: "RestoreNode", payload: { nodeId: "t1" } }),
    );
  });

  it("permanently deleting a row asks for confirmation and only issues PurgeNode when confirmed", async () => {
    mswServer.use(
      http.get("/api/trash", () => HttpResponse.json([row({ id: "t1", title: "Old project" })])),
    );
    let received: unknown;
    mswServer.use(
      http.post("/api/commands", async ({ request }) => {
        received = await request.json();
        return HttpResponse.json(null);
      }),
    );
    const user = userEvent.setup();

    renderWithProviders(<TrashView />);
    vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    await user.click(await screen.findByRole("button", { name: "Permanently delete" }));
    expect(received).toBeUndefined();

    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    await user.click(screen.getByRole("button", { name: "Permanently delete" }));

    await vi.waitFor(() =>
      expect(received).toEqual({ type: "PurgeNode", payload: { nodeId: "t1" } }),
    );
  });

  it("emptying the trash asks for confirmation and only issues EmptyTrash when confirmed", async () => {
    mswServer.use(
      http.get("/api/trash", () => HttpResponse.json([row({ id: "t1", title: "Old project" })])),
    );
    let received: unknown;
    mswServer.use(
      http.post("/api/commands", async ({ request }) => {
        received = await request.json();
        return HttpResponse.json(null);
      }),
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();

    renderWithProviders(<TrashView />);
    await user.click(await screen.findByRole("button", { name: "Empty Trash" }));

    await vi.waitFor(() => expect(received).toEqual({ type: "EmptyTrash", payload: {} }));
  });
});
