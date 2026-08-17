import express, { type Express } from "express";
import type { CommandContext } from "../commands/Command.js";
import { executeCommand } from "../commands/executeCommand.js";
import { getColumn } from "../queries/getColumn.js";
import { getNode } from "../queries/getNode.js";
import type { CommandLogRepository } from "../repo/CommandLogRepository.js";
import type { NodeRepository } from "../repo/NodeRepository.js";
import { buildCommand } from "./commandDispatch.js";

export function createApp(
  repo: NodeRepository,
  ctx: CommandContext,
  commandLog: CommandLogRepository,
): Express {
  const app = express();
  app.use(express.json());

  app.get("/api/columns/:parentId", (req, res) => {
    const parentId = req.params.parentId === "root" ? null : req.params.parentId;
    res.json(getColumn(repo, parentId));
  });

  app.get("/api/nodes/:id", (req, res) => {
    const node = getNode(repo, req.params.id);
    if (!node) {
      res.status(404).json({ error: `node ${req.params.id} not found` });
      return;
    }
    res.json(node);
  });

  app.post("/api/commands", (req, res) => {
    try {
      const { command, nodeId } = buildCommand(ctx, req.body.type, req.body.payload);
      executeCommand(command, ctx, commandLog);
      res.json(getNode(repo, nodeId));
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  return app;
}
