// @vitest-environment jsdom
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import "../test/setup.js";
import { mswServer } from "../test/mswServer.js";
import { getColumn, getNode, runCommand } from "./client.js";

describe("getColumn", () => {
  it("fetches and parses a column's rows", async () => {
    mswServer.use(
      http.get("/api/columns/root", () =>
        HttpResponse.json([
          {
            id: "x",
            type: "project",
            title: "Areas",
            isSystem: false,
            whenDate: null,
            deadline: null,
            completedAt: null,
            isComplete: false,
            openDescendantCount: 0,
          },
        ]),
      ),
    );

    const rows = await getColumn(null);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("x");
  });

  it("requests the literal 'root' path for a null parentId, and the id otherwise", async () => {
    let requestedUrl = "";
    mswServer.use(
      http.get("/api/columns/:parentId", ({ params }) => {
        requestedUrl = params.parentId as string;
        return HttpResponse.json([]);
      }),
    );

    await getColumn("abc-123");

    expect(requestedUrl).toBe("abc-123");
  });
});

describe("getNode", () => {
  it("fetches and parses a node's detail", async () => {
    mswServer.use(
      http.get("/api/nodes/x", () =>
        HttpResponse.json({
          id: "x",
          type: "todo",
          title: "Buy milk",
          notes: "",
          whenDate: null,
          deadline: null,
          completedAt: null,
        }),
      ),
    );

    const node = await getNode("x");

    expect(node.title).toBe("Buy milk");
  });
});

describe("runCommand", () => {
  it("posts the command and returns the mutated node", async () => {
    mswServer.use(
      http.post("/api/commands", async ({ request }) => {
        const body = (await request.json()) as { type: string };
        expect(body.type).toBe("RenameNode");
        return HttpResponse.json({ id: "x", title: "new" });
      }),
    );

    const result = await runCommand("RenameNode", { nodeId: "x", title: "new" });

    expect(result.title).toBe("new");
  });

  it("throws with the server's error message on a non-2xx response", async () => {
    mswServer.use(
      http.post("/api/commands", () => HttpResponse.json({ error: "bad request" }, { status: 400 })),
    );

    await expect(runCommand("RenameNode", { nodeId: "x", title: "" })).rejects.toThrow(
      "bad request",
    );
  });
});
