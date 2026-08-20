import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../../server/app.js";
import type { CommandContext } from "../../commands/Command.js";
import { fixedClock } from "../../lib/clock.js";
import { generateId } from "../../lib/id.js";
import { INBOX_ID } from "../../db/constants.js";
import { SqliteCommandLogRepository } from "../../repo/SqliteCommandLogRepository.js";
import type { NodeRepository } from "../../repo/NodeRepository.js";
import { newNodeInput } from "../helpers/buildNode.js";
import { createTestRepo } from "../helpers/testDb.js";

let repo: NodeRepository;
let app: Express;

beforeEach(() => {
  const created = createTestRepo();
  repo = created.repo;
  const ctx: CommandContext = {
    repo,
    now: fixedClock("2024-06-01T00:00:00.000Z"),
    genId: generateId,
  };
  const commandLog = new SqliteCommandLogRepository(created.db);
  app = createApp(repo, ctx, commandLog);
});

describe("GET /api/columns/:parentId", () => {
  it("returns a project's children", async () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    const todo = newNodeInput({ type: "todo", parentId: root.id });
    repo.insert(todo);

    const res = await request(app).get(`/api/columns/${root.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(todo.id);
  });

  it("returns root-level projects, including Inbox, for parentId 'root'", async () => {
    const res = await request(app).get("/api/columns/root");

    expect(res.status).toBe(200);
    expect(res.body.some((r: { id: string }) => r.id === INBOX_ID)).toBe(true);
  });
});

describe("GET /api/nodes/:id", () => {
  it("returns a node's detail", async () => {
    const todo = newNodeInput({ type: "todo", title: "Buy milk" });
    repo.insert(todo);

    const res = await request(app).get(`/api/nodes/${todo.id}`);

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Buy milk");
  });

  it("returns 404 for a missing id", async () => {
    const res = await request(app).get("/api/nodes/missing");

    expect(res.status).toBe(404);
  });
});

describe("GET /api/today", () => {
  it("returns todos due today grouped by project", async () => {
    const project = newNodeInput({ type: "project" });
    repo.insert(project);
    const todo = newNodeInput({ type: "todo", parentId: project.id, whenDate: "2024-06-01" });
    repo.insert(todo);

    const res = await request(app).get("/api/today");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      expect.objectContaining({
        projectId: project.id,
        rows: [expect.objectContaining({ id: todo.id })],
      }),
    ]);
  });
});

describe("GET /api/logbook", () => {
  it("returns completed todos grouped by completion day", async () => {
    const project = newNodeInput({ type: "project" });
    repo.insert(project);
    repo.adjustOpenDescendantCount([project.id], 1);
    const todo = newNodeInput({ type: "todo", parentId: project.id });
    repo.insert(todo);
    repo.updateCompletedAt(todo.id, "2024-06-01T00:00:00.000Z", "2024-06-01T00:00:00.000Z");

    const res = await request(app).get("/api/logbook");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      expect.objectContaining({
        day: "2024-06-01",
        rows: [expect.objectContaining({ id: todo.id })],
      }),
    ]);
  });
});

describe("GET /api/trash", () => {
  it("returns trashed roots", async () => {
    const node = newNodeInput({ type: "project" });
    repo.insert(node);
    repo.updateDeletedAt(node.id, "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");

    const res = await request(app).get("/api/trash");

    expect(res.status).toBe(200);
    expect(res.body.map((r: { id: string }) => r.id)).toEqual([node.id]);
  });
});

describe("GET /api/search", () => {
  it("returns matching live nodes with their path", async () => {
    const project = newNodeInput({ type: "project" });
    repo.insert(project);
    const todo = newNodeInput({ type: "todo", parentId: project.id, title: "Buy milk" });
    repo.insert(todo);

    const res = await request(app).get("/api/search").query({ q: "milk" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      expect.objectContaining({
        id: todo.id,
        path: [expect.objectContaining({ id: project.id })],
      }),
    ]);
  });

  it("returns an empty array rather than an error when q is missing", async () => {
    const res = await request(app).get("/api/search");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("POST /api/commands", () => {
  it("creates a todo and returns it", async () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);

    const res = await request(app)
      .post("/api/commands")
      .send({
        type: "CreateNode",
        payload: {
          parentId: root.id,
          type: "todo",
          title: "Buy milk",
          notes: "",
          sortKey: "a0",
          whenDate: null,
          deadline: null,
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Buy milk");
    expect(repo.getChildren(root.id)).toHaveLength(1);
  });

  it("renames a node", async () => {
    const node = newNodeInput({ type: "todo", title: "old" });
    repo.insert(node);

    const res = await request(app)
      .post("/api/commands")
      .send({ type: "RenameNode", payload: { nodeId: node.id, title: "new" } });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("new");
  });

  it("returns 400 with the command's error message on a validation failure", async () => {
    const res = await request(app)
      .post("/api/commands")
      .send({
        type: "CreateNode",
        payload: {
          parentId: null,
          type: "todo",
          title: "",
          notes: "",
          sortKey: "a0",
          whenDate: null,
          deadline: null,
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/root/i);
  });

  it("moves a node to a new parent", async () => {
    const rootA = newNodeInput({ type: "project" });
    const rootB = newNodeInput({ type: "project" });
    repo.insert(rootA);
    repo.insert(rootB);
    const todo = newNodeInput({ type: "todo", parentId: rootA.id });
    repo.insert(todo);

    const res = await request(app).post("/api/commands").send({
      type: "MoveNode",
      payload: { nodeId: todo.id, newParentId: rootB.id, newSortKey: "a0" },
    });

    expect(res.status).toBe(200);
    expect(repo.getById(todo.id)?.parentId).toBe(rootB.id);
  });

  it("rejects a command type not exposed over HTTP", async () => {
    const node = newNodeInput({ type: "todo" });
    repo.insert(node);

    const res = await request(app)
      .post("/api/commands")
      .send({ type: "HardDeleteNode", payload: { nodeId: node.id } });

    expect(res.status).toBe(400);
  });

  it("restores a trashed node", async () => {
    const node = newNodeInput({ type: "project" });
    repo.insert(node);
    repo.updateDeletedAt(node.id, "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");

    const res = await request(app)
      .post("/api/commands")
      .send({ type: "RestoreNode", payload: { nodeId: node.id } });

    expect(res.status).toBe(200);
    expect(repo.getById(node.id)?.deletedAt).toBeNull();
  });

  it("empties the trash", async () => {
    const node = newNodeInput({ type: "project" });
    repo.insert(node);
    repo.updateDeletedAt(node.id, "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");

    const res = await request(app).post("/api/commands").send({ type: "EmptyTrash", payload: {} });

    expect(res.status).toBe(200);
    expect(repo.getById(node.id)).toBeNull();
  });

  it("purges a single trash root", async () => {
    const node = newNodeInput({ type: "project" });
    repo.insert(node);
    repo.updateDeletedAt(node.id, "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");

    const res = await request(app)
      .post("/api/commands")
      .send({ type: "PurgeNode", payload: { nodeId: node.id } });

    expect(res.status).toBe(200);
    expect(repo.getById(node.id)).toBeNull();
  });

  it("rejects purging a node that is not a trash root", async () => {
    const node = newNodeInput({ type: "project" });
    repo.insert(node);

    const res = await request(app)
      .post("/api/commands")
      .send({ type: "PurgeNode", payload: { nodeId: node.id } });

    expect(res.status).toBe(400);
  });

  it("rebalances a parent's children after an insert grows a sort_key past the threshold", async () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    const long = newNodeInput({ type: "todo", parentId: root.id, sortKey: "a".repeat(51) });
    repo.insert(long);

    await request(app)
      .post("/api/commands")
      .send({
        type: "CreateNode",
        payload: {
          parentId: root.id,
          type: "todo",
          title: "x",
          notes: "",
          // Must be a valid order key (CreateNode now rejects malformed
          // ones) and, less obviously, must not collide with either key
          // evenlySpacedKeys(2) will hand out ("a0"/"a1") once rebalanced —
          // undoing the rebalance restores prior keys one at a time and
          // transiently re-collides with whichever of those two is still
          // held by the other sibling, rolling the whole undo back silently.
          sortKey: "a5",
          whenDate: null,
          deadline: null,
        },
      });

    const children = repo.getChildren(root.id);
    expect(children.length).toBeGreaterThan(0);
    expect(children.every((c) => c.sortKey.length <= 50)).toBe(true);
  });

  it("rejects an unknown command type", async () => {
    const res = await request(app).post("/api/commands").send({ type: "Nonsense", payload: {} });

    expect(res.status).toBe(400);
  });
});

describe("POST /api/undo and /api/redo", () => {
  it("undoes the last command", async () => {
    const node = newNodeInput({ type: "todo", title: "old" });
    repo.insert(node);
    await request(app)
      .post("/api/commands")
      .send({ type: "RenameNode", payload: { nodeId: node.id, title: "new" } });

    const res = await request(app).post("/api/undo");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(repo.getById(node.id)?.title).toBe("old");
  });

  it("redoes after an undo", async () => {
    const node = newNodeInput({ type: "todo", title: "old" });
    repo.insert(node);
    await request(app)
      .post("/api/commands")
      .send({ type: "RenameNode", payload: { nodeId: node.id, title: "new" } });
    await request(app).post("/api/undo");

    const res = await request(app).post("/api/redo");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(repo.getById(node.id)?.title).toBe("new");
  });

  it("returns { ok: false } when there is nothing to undo", async () => {
    const res = await request(app).post("/api/undo");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: false });
  });

  it("returns { ok: false } when there is nothing to redo", async () => {
    const res = await request(app).post("/api/redo");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: false });
  });

  it("undoing a rebalance-triggering create takes two undos: first the rebalance, then the create", async () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    const long = newNodeInput({ type: "todo", parentId: root.id, sortKey: "a".repeat(51) });
    repo.insert(long);

    await request(app)
      .post("/api/commands")
      .send({
        type: "CreateNode",
        payload: {
          parentId: root.id,
          type: "todo",
          title: "new todo",
          notes: "",
          // Must be a valid order key (CreateNode now rejects malformed
          // ones) and, less obviously, must not collide with either key
          // evenlySpacedKeys(2) will hand out ("a0"/"a1") once rebalanced —
          // undoing the rebalance restores prior keys one at a time and
          // transiently re-collides with whichever of those two is still
          // held by the other sibling, rolling the whole undo back silently.
          sortKey: "a5",
          whenDate: null,
          deadline: null,
        },
      });
    const afterCreate = repo.getChildren(root.id);
    expect(afterCreate).toHaveLength(2);
    expect(afterCreate.every((c) => c.sortKey.length <= 50)).toBe(true);

    await request(app).post("/api/undo"); // undoes the Rebalance only
    const afterFirstUndo = repo.getChildren(root.id);
    expect(afterFirstUndo).toHaveLength(2);
    expect(afterFirstUndo.some((c) => c.sortKey.length > 50)).toBe(true);

    await request(app).post("/api/undo"); // undoes the CreateNode
    const afterSecondUndo = repo.getChildren(root.id);
    expect(afterSecondUndo).toHaveLength(1);
  });

  it("EmptyTrash clears the undo stack, including earlier entries", async () => {
    const node = newNodeInput({ type: "todo" });
    repo.insert(node);
    await request(app)
      .post("/api/commands")
      .send({ type: "TrashNode", payload: { nodeId: node.id } });
    await request(app).post("/api/commands").send({ type: "EmptyTrash", payload: {} });

    const res = await request(app).post("/api/undo");

    expect(res.body).toEqual({ ok: false });
  });
});

describe("static frontend serving", () => {
  function buildApp(staticDir: string): Express {
    const created = createTestRepo();
    const ctx: CommandContext = {
      repo: created.repo,
      now: fixedClock("2024-06-01T00:00:00.000Z"),
      genId: generateId,
    };
    return createApp(created.repo, ctx, new SqliteCommandLogRepository(created.db), { staticDir });
  }

  it("serves the built index.html for a non-API GET route when a build exists", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "tend-dist-"));
    writeFileSync(path.join(dir, "index.html"), "<html>built app</html>");
    try {
      const res = await request(buildApp(dir)).get("/some/client/route");

      expect(res.status).toBe(200);
      expect(res.text).toContain("built app");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns 404 for an unmatched /api route even when a build exists", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "tend-dist-"));
    writeFileSync(path.join(dir, "index.html"), "<html>built app</html>");
    try {
      const res = await request(buildApp(dir)).get("/api/does-not-exist");

      expect(res.status).toBe(404);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("falls through to a plain 404 when no build exists yet", async () => {
    const res = await request(buildApp("/nonexistent/tend-dist")).get("/");

    expect(res.status).toBe(404);
  });
});
