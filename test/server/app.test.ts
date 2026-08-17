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

  it("rejects a command type not exposed over HTTP", async () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);

    const res = await request(app)
      .post("/api/commands")
      .send({ type: "MoveNode", payload: { nodeId: root.id, newParentId: null, newSortKey: "a0" } });

    expect(res.status).toBe(400);
  });

  it("rejects an unknown command type", async () => {
    const res = await request(app).post("/api/commands").send({ type: "Nonsense", payload: {} });

    expect(res.status).toBe(400);
  });
});
