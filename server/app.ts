import { existsSync } from "node:fs";
import path from "node:path";
import express, { type Express } from "express";
import type { CommandContext } from "../commands/Command.js";
import { executeCommand } from "../commands/executeCommand.js";
import { Rebalance } from "../commands/Rebalance.js";
import { getColumn } from "../queries/getColumn.js";
import { getNode } from "../queries/getNode.js";
import type { CommandLogRepository } from "../repo/CommandLogRepository.js";
import type { NodeRepository } from "../repo/NodeRepository.js";
import { buildCommand } from "./commandDispatch.js";

export interface CreateAppOptions {
  /** Directory holding the built frontend (vite build's outDir). Defaults to dist/web. */
  staticDir?: string;
}

/** Spec 6.1: rebalance a parent's children once any sibling's sort_key grows past this length. */
const REBALANCE_THRESHOLD = 50;

export function createApp(
  repo: NodeRepository,
  ctx: CommandContext,
  commandLog: CommandLogRepository,
  options: CreateAppOptions = {},
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
      const { command, nodeId, affectedParentId } = buildCommand(
        ctx,
        req.body.type,
        req.body.payload,
      );
      executeCommand(command, ctx, commandLog);

      if (affectedParentId !== null) {
        const needsRebalance = repo
          .getChildren(affectedParentId)
          .some((child) => child.sortKey.length > REBALANCE_THRESHOLD);
        if (needsRebalance) {
          executeCommand(new Rebalance(affectedParentId), ctx, commandLog);
        }
      }

      res.json(getNode(repo, nodeId));
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  const staticDir = options.staticDir ?? path.resolve(process.cwd(), "dist/web");
  if (existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.use((req, res, next) => {
      if (req.path.startsWith("/api")) {
        next();
        return;
      }
      res.sendFile(path.join(staticDir, "index.html"));
    });
  }

  return app;
}
