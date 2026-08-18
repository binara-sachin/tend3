# Phase 5 — Undo/Redo Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `⌘Z`/`⌘⇧Z` undo and redo any command applied this server session, using the inverses every command already implements.

**Architecture:** A server-memory undo/redo stack (`server/undoStack.ts`), instantiated once per `createApp()` call and pushed to after every successful `executeCommand`. Two new routes (`POST /api/undo`, `/api/redo`) pop it. The frontend wires `⌘Z`/`⌘⇧Z` into the existing global keyboard listener and reuses the existing broad cache-invalidation strategy, pulled into one shared helper. One small, directly-justified fix to `DetailPane` closes a display bug undo would otherwise expose.

**Tech Stack:** TypeScript, Express, Vitest, supertest, React, TanStack Query — all already in place; no new dependencies.

## Global Constraints

- No SQL outside `repo/`; no database write outside `commands/` (unchanged — nothing in this phase writes SQL or touches the DB directly; the undo stack only ever calls `executeCommand`).
- Every executed command — including an auto-triggered `Rebalance` — gets its own undo-stack entry. No bundling/grouping concept exists anywhere in this phase.
- `EmptyTrash`/`PurgeNode` running clears BOTH the undo and redo stacks entirely (not just skipping that one entry).
- No visible undo/redo affordance beyond the `⌘Z`/`⌘⇧Z` keyboard shortcuts — no toast, no menu item, no history list.
- `⌘Z`/`⌘⇧Z` are ignored (do nothing, no `preventDefault()`) while `document.activeElement` is an `<input>` or `<textarea>`, so native per-field browser undo keeps working.
- Full design rationale: `docs/superpowers/specs/2026-08-18-phase5-undo-redo-design.md`.

---

### Task 1: `server/undoStack.ts`

**Files:**
- Create: `server/undoStack.ts`
- Test: `test/server/undoStack.test.ts`

**Interfaces:**
- Consumes: `Command`/`CommandContext` (`commands/Command.js`), `executeCommand` (`commands/executeCommand.js`), `NotInvertibleError` (`commands/NotInvertibleError.js`), `CommandLogRepository` (`repo/CommandLogRepository.js`) — all existing.
- Produces:
  ```ts
  export interface UndoStack {
    push(command: Command): void;
    undo(ctx: CommandContext, commandLog: CommandLogRepository): boolean;
    redo(ctx: CommandContext, commandLog: CommandLogRepository): boolean;
  }
  export function createUndoStack(): UndoStack
  ```
  `push` returns nothing; `undo`/`redo` return `true` if something happened, `false` if their stack was empty. Task 2 calls all three directly.

- [ ] **Step 1: Write the failing tests**

  ```ts
  // test/server/undoStack.test.ts
  import { beforeEach, describe, expect, it } from "vitest";
  import { createUndoStack, type UndoStack } from "../../server/undoStack.js";
  import type { CommandContext } from "../../commands/Command.js";
  import { EmptyTrash } from "../../commands/EmptyTrash.js";
  import { executeCommand } from "../../commands/executeCommand.js";
  import { RenameNode } from "../../commands/RenameNode.js";
  import { fixedClock } from "../../lib/clock.js";
  import { generateId } from "../../lib/id.js";
  import { SqliteCommandLogRepository } from "../../repo/SqliteCommandLogRepository.js";
  import type { CommandLogRepository } from "../../repo/CommandLogRepository.js";
  import type { NodeRepository } from "../../repo/NodeRepository.js";
  import { newNodeInput } from "../helpers/buildNode.js";
  import { createTestRepo } from "../helpers/testDb.js";

  let repo: NodeRepository;
  let ctx: CommandContext;
  let commandLog: CommandLogRepository;
  let stack: UndoStack;

  beforeEach(() => {
    const created = createTestRepo();
    repo = created.repo;
    ctx = { repo, now: fixedClock("2024-06-01T00:00:00.000Z"), genId: generateId };
    commandLog = new SqliteCommandLogRepository(created.db);
    stack = createUndoStack();
  });

  describe("createUndoStack", () => {
    it("undo() reverses the last pushed command", () => {
      const node = newNodeInput({ type: "todo", title: "old" });
      repo.insert(node);
      const rename = new RenameNode(node.id, "new");
      executeCommand(rename, ctx, commandLog);
      stack.push(rename);

      const undone = stack.undo(ctx, commandLog);

      expect(undone).toBe(true);
      expect(repo.getById(node.id)?.title).toBe("old");
    });

    it("redo() re-applies the command undo just reversed", () => {
      const node = newNodeInput({ type: "todo", title: "old" });
      repo.insert(node);
      const rename = new RenameNode(node.id, "new");
      executeCommand(rename, ctx, commandLog);
      stack.push(rename);
      stack.undo(ctx, commandLog);

      const redone = stack.redo(ctx, commandLog);

      expect(redone).toBe(true);
      expect(repo.getById(node.id)?.title).toBe("new");
    });

    it("undo() on an empty stack returns false and changes nothing", () => {
      const node = newNodeInput({ type: "todo", title: "old" });
      repo.insert(node);

      const undone = stack.undo(ctx, commandLog);

      expect(undone).toBe(false);
      expect(repo.getById(node.id)?.title).toBe("old");
    });

    it("redo() on an empty stack returns false and changes nothing", () => {
      const node = newNodeInput({ type: "todo", title: "old" });
      repo.insert(node);

      const redone = stack.redo(ctx, commandLog);

      expect(redone).toBe(false);
      expect(repo.getById(node.id)?.title).toBe("old");
    });

    it("a fresh push clears any pending redo entry", () => {
      const node = newNodeInput({ type: "todo", title: "a" });
      repo.insert(node);
      const rename1 = new RenameNode(node.id, "b");
      executeCommand(rename1, ctx, commandLog);
      stack.push(rename1);
      stack.undo(ctx, commandLog); // title back to "a"; redo stack now holds rename1

      const rename2 = new RenameNode(node.id, "c");
      executeCommand(rename2, ctx, commandLog);
      stack.push(rename2);

      const redone = stack.redo(ctx, commandLog);

      expect(redone).toBe(false);
      expect(repo.getById(node.id)?.title).toBe("c");
    });

    it("pushing an irreversible command clears both stacks", () => {
      const project = newNodeInput({ type: "project" });
      repo.insert(project);
      const rename = new RenameNode(project.id, "renamed");
      executeCommand(rename, ctx, commandLog);
      stack.push(rename);

      const emptyTrash = new EmptyTrash();
      executeCommand(emptyTrash, ctx, commandLog);
      stack.push(emptyTrash);

      expect(stack.undo(ctx, commandLog)).toBe(false);
      expect(stack.redo(ctx, commandLog)).toBe(false);
    });
  });
  ```

- [ ] **Step 2: Run the tests to verify they fail**

  Run: `npx vitest run test/server/undoStack.test.ts`
  Expected: FAIL — `Cannot find module '../../server/undoStack.js'`.

- [ ] **Step 3: Implement `server/undoStack.ts`**

  ```ts
  // server/undoStack.ts
  import type { Command, CommandContext } from "../commands/Command.js";
  import { executeCommand } from "../commands/executeCommand.js";
  import { NotInvertibleError } from "../commands/NotInvertibleError.js";
  import type { CommandLogRepository } from "../repo/CommandLogRepository.js";

  export interface UndoStack {
    push(command: Command): void;
    undo(ctx: CommandContext, commandLog: CommandLogRepository): boolean;
    redo(ctx: CommandContext, commandLog: CommandLogRepository): boolean;
  }

  /**
   * Lives in server memory only (spec 7.4) — a fresh instance per createApp()
   * call, not a module-level singleton, so tests never leak undo state
   * across app instances.
   */
  export function createUndoStack(): UndoStack {
    const undoEntries: Command[] = [];
    const redoEntries: Command[] = [];

    return {
      push(command) {
        try {
          command.invert();
        } catch (err) {
          if (err instanceof NotInvertibleError) {
            undoEntries.length = 0;
            redoEntries.length = 0;
            return;
          }
          throw err;
        }
        undoEntries.push(command);
        redoEntries.length = 0;
      },

      undo(ctx, commandLog) {
        const command = undoEntries.pop();
        if (!command) return false;
        executeCommand(command.invert(), ctx, commandLog);
        redoEntries.push(command);
        return true;
      },

      redo(ctx, commandLog) {
        const command = redoEntries.pop();
        if (!command) return false;
        executeCommand(command, ctx, commandLog);
        undoEntries.push(command);
        return true;
      },
    };
  }
  ```

- [ ] **Step 4: Run the tests to verify they pass**

  Run: `npx vitest run test/server/undoStack.test.ts`
  Expected: PASS (6 tests).

- [ ] **Step 5: Run the full suite and typecheck, then commit**

  ```bash
  npx vitest run
  npm run typecheck
  git add server/undoStack.ts test/server/undoStack.test.ts
  git commit -m "Add server-memory undo/redo stack"
  ```

---

### Task 2: Wire the stack into `POST /api/commands`, add `POST /api/undo` and `/api/redo`

**Files:**
- Modify: `server/app.ts`
- Test: `test/server/app.test.ts`

**Interfaces:**
- Consumes: `createUndoStack` from Task 1.
- Produces: `POST /api/undo`, `POST /api/redo`, both responding `{ ok: boolean }`. No new exported functions — this task only changes route wiring inside `createApp()`.

- [ ] **Step 1: Write the failing tests**

  Add to `test/server/app.test.ts` (after the existing `describe("POST /api/commands", ...)` block, same file, same `beforeEach` setup already in that file):

  ```ts
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
            sortKey: "b",
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
  ```

- [ ] **Step 2: Run the tests to verify they fail**

  Run: `npx vitest run test/server/app.test.ts`
  Expected: FAIL — `POST /api/undo` and `POST /api/redo` don't exist yet (404s / wrong response shape).

- [ ] **Step 3: Implement the wiring**

  In `server/app.ts`, add the import and instantiate the stack once per app:

  ```ts
  import { createUndoStack } from "./undoStack.js";
  ```

  ```ts
  export function createApp(
    repo: NodeRepository,
    ctx: CommandContext,
    commandLog: CommandLogRepository,
    options: CreateAppOptions = {},
  ): Express {
    const app = express();
    app.use(express.json());
    const undoStack = createUndoStack();
    // ...existing GET routes unchanged...
  ```

  Modify the existing `POST /api/commands` handler to push after each successful `executeCommand`:

  ```ts
  app.post("/api/commands", (req, res) => {
    try {
      const { command, nodeId, affectedParentId } = buildCommand(
        ctx,
        req.body.type,
        req.body.payload,
      );
      executeCommand(command, ctx, commandLog);
      undoStack.push(command);

      if (affectedParentId !== null) {
        const needsRebalance = repo
          .getChildren(affectedParentId)
          .some((child) => child.sortKey.length > REBALANCE_THRESHOLD);
        if (needsRebalance) {
          const rebalance = new Rebalance(affectedParentId);
          executeCommand(rebalance, ctx, commandLog);
          undoStack.push(rebalance);
        }
      }

      res.json(nodeId !== null ? getNode(repo, nodeId) : null);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });
  ```

  Add the two new routes (placed after `POST /api/commands`, before the static-file serving block):

  ```ts
  app.post("/api/undo", (_req, res) => {
    try {
      res.json({ ok: undoStack.undo(ctx, commandLog) });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post("/api/redo", (_req, res) => {
    try {
      res.json({ ok: undoStack.redo(ctx, commandLog) });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });
  ```

- [ ] **Step 4: Run the tests to verify they pass**

  Run: `npx vitest run test/server/app.test.ts`
  Expected: PASS (all tests in the file, including the 5 new ones).

- [ ] **Step 5: Run the full suite and typecheck, then commit**

  ```bash
  npx vitest run
  npm run typecheck
  git add server/app.ts test/server/app.test.ts
  git commit -m "Wire undo/redo stack into POST /api/commands; add /api/undo and /api/redo"
  ```

---

### Task 3: Frontend client + hooks — `useUndo`, `useRedo`, shared invalidation

**Files:**
- Modify: `web/src/api/client.ts`, `web/src/queries/hooks.ts`
- Test: `web/src/api/client.test.ts`, `web/src/queries/hooks.test.tsx`

**Interfaces:**
- Consumes: nothing new from other tasks — talks to the routes Task 2 added.
- Produces:
  ```ts
  // web/src/api/client.ts
  export async function undo(): Promise<{ ok: boolean }>
  export async function redo(): Promise<{ ok: boolean }>
  ```
  ```ts
  // web/src/queries/hooks.ts
  export function useUndo(): UseMutationResult<{ ok: boolean }, Error, void>
  export function useRedo(): UseMutationResult<{ ok: boolean }, Error, void>
  ```
  Task 4 (`useKeyboardShortcuts.ts`) calls `useUndo()`/`useRedo()` and their `.mutate()`.

- [ ] **Step 1: Write the failing client tests**

  Add to `web/src/api/client.test.ts`:

  ```ts
  import { getColumn, getNode, redo, runCommand, undo } from "./client.js";
  ```

  (replacing the existing `import { getColumn, getNode, runCommand } from "./client.js";` line at the top)

  ```ts
  describe("undo", () => {
    it("posts to /api/undo and returns the parsed result", async () => {
      mswServer.use(http.post("/api/undo", () => HttpResponse.json({ ok: true })));

      const result = await undo();

      expect(result).toEqual({ ok: true });
    });
  });

  describe("redo", () => {
    it("posts to /api/redo and returns the parsed result", async () => {
      mswServer.use(http.post("/api/redo", () => HttpResponse.json({ ok: false })));

      const result = await redo();

      expect(result).toEqual({ ok: false });
    });
  });
  ```

- [ ] **Step 2: Write the failing hooks tests**

  Add to `web/src/queries/hooks.test.tsx`:

  ```ts
  import { useColumn, useNode, useRedo, useRunCommand, useUndo } from "./hooks.js";
  ```

  (replacing the existing `import { useColumn, useNode, useRunCommand } from "./hooks.js";` line at the top)

  ```ts
  describe("useRunCommand", () => {
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
  ```

- [ ] **Step 3: Run the tests to verify they fail**

  Run: `npx vitest run web/src/api/client.test.ts web/src/queries/hooks.test.tsx`
  Expected: FAIL — `undo`/`redo`/`useUndo`/`useRedo` are not exported yet; the new `useRunCommand` node-invalidation test also fails (current behavior doesn't invalidate `["node", ...]` at all).

- [ ] **Step 4: Implement the client functions**

  In `web/src/api/client.ts`, add after the existing `getSearchResults`:

  ```ts
  export async function undo(): Promise<{ ok: boolean }> {
    const res = await fetch(apiUrl("/api/undo"), { method: "POST" });
    return parseOrThrow<{ ok: boolean }>(res);
  }

  export async function redo(): Promise<{ ok: boolean }> {
    const res = await fetch(apiUrl("/api/redo"), { method: "POST" });
    return parseOrThrow<{ ok: boolean }>(res);
  }
  ```

- [ ] **Step 5: Implement the shared invalidation helper and the two hooks**

  In `web/src/queries/hooks.ts`, replace the `import` line and the `useRunCommand` function:

  ```ts
  import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
  import { getColumn, getLogbook, getNode, getToday, getTrash, redo, runCommand, undo } from "../api/client.js";
  import { useUiStore } from "../store/uiStore.js";
  ```

  ```ts
  function invalidateAfterMutation(queryClient: QueryClient, parentId?: string) {
    if (parentId !== undefined) {
      queryClient.invalidateQueries({ queryKey: ["columns", parentId] });
    }
    const openPath = useUiStore.getState().openPath;
    for (const entry of openPath) {
      queryClient.invalidateQueries({ queryKey: ["columns", entry.id] });
    }
    const lastEntry = openPath.at(-1);
    if (lastEntry?.type === "todo") {
      queryClient.invalidateQueries({ queryKey: ["node", lastEntry.id] });
    }
    queryClient.invalidateQueries({ queryKey: ["today"] });
    queryClient.invalidateQueries({ queryKey: ["logbook"] });
    queryClient.invalidateQueries({ queryKey: ["trash"] });
  }

  export function useRunCommand() {
    const queryClient = useQueryClient();

    return useMutation({
      mutationFn: (vars: RunCommandVars) => runCommand(vars.type, vars.payload),
      onSuccess: (_data, vars) => invalidateAfterMutation(queryClient, vars.parentId),
    });
  }

  export function useUndo() {
    const queryClient = useQueryClient();

    return useMutation({
      mutationFn: () => undo(),
      onSuccess: () => invalidateAfterMutation(queryClient),
    });
  }

  export function useRedo() {
    const queryClient = useQueryClient();

    return useMutation({
      mutationFn: () => redo(),
      onSuccess: () => invalidateAfterMutation(queryClient),
    });
  }
  ```

  (`RunCommandVars` and everything above `useRunCommand` — `useColumn`, `useNode`, `useToday`, `useLogbook`, `useTrash` — stay exactly as they are.)

- [ ] **Step 6: Run the tests to verify they pass**

  Run: `npx vitest run web/src/api/client.test.ts web/src/queries/hooks.test.tsx`
  Expected: PASS (all tests in both files, including the new ones).

- [ ] **Step 7: Run the full suite and typecheck, then commit**

  ```bash
  npx vitest run
  npm run typecheck
  git add web/src/api/client.ts web/src/api/client.test.ts web/src/queries/hooks.ts web/src/queries/hooks.test.tsx
  git commit -m "Add useUndo/useRedo hooks; extract shared cache-invalidation helper"
  ```

---

### Task 4: `⌘Z` / `⌘⇧Z` in the global keyboard shortcuts

**Files:**
- Modify: `web/src/keyboard/useKeyboardShortcuts.ts`
- Test: `web/src/keyboard/useKeyboardShortcuts.test.tsx`

**Interfaces:**
- Consumes: `useUndo`, `useRedo` from Task 3.
- Produces: no new exports — `useKeyboardShortcuts()`'s existing signature (`(): void`) is unchanged.

- [ ] **Step 1: Write the failing tests**

  Add to `web/src/keyboard/useKeyboardShortcuts.test.tsx` (this file already has a `capturePost()` helper for `/api/commands`; these tests intercept `/api/undo`/`/api/redo` the same way):

  ```ts
  async function captureUndo(): Promise<void> {
    return new Promise((resolve) => {
      mswServer.use(
        http.post("/api/undo", () => {
          resolve();
          return HttpResponse.json({ ok: true });
        }),
      );
    });
  }

  async function captureRedo(): Promise<void> {
    return new Promise((resolve) => {
      mswServer.use(
        http.post("/api/redo", () => {
          resolve();
          return HttpResponse.json({ ok: true });
        }),
      );
    });
  }

  describe("useKeyboardShortcuts — undo/redo", () => {
    it("Cmd+Z posts to /api/undo", async () => {
      const queryClient = new QueryClient();
      const calledPromise = captureUndo();
      renderShortcuts(queryClient);

      await userEvent.keyboard("{Meta>}z{/Meta}");

      await calledPromise;
    });

    it("Cmd+Shift+Z posts to /api/redo", async () => {
      const queryClient = new QueryClient();
      const calledPromise = captureRedo();
      renderShortcuts(queryClient);

      await userEvent.keyboard("{Meta>}{Shift>}z{/Shift}{/Meta}");

      await calledPromise;
    });

    it("Cmd+Z is ignored while a text input has focus", async () => {
      const queryClient = new QueryClient();
      let called = false;
      mswServer.use(
        http.post("/api/undo", () => {
          called = true;
          return HttpResponse.json({ ok: true });
        }),
      );
      renderShortcuts(queryClient);
      const input = document.createElement("input");
      document.body.appendChild(input);
      input.focus();

      await userEvent.keyboard("{Meta>}z{/Meta}");

      expect(called).toBe(false);
      document.body.removeChild(input);
    });

    it("Cmd+Z is ignored while a textarea has focus", async () => {
      const queryClient = new QueryClient();
      let called = false;
      mswServer.use(
        http.post("/api/undo", () => {
          called = true;
          return HttpResponse.json({ ok: true });
        }),
      );
      renderShortcuts(queryClient);
      const textarea = document.createElement("textarea");
      document.body.appendChild(textarea);
      textarea.focus();

      await userEvent.keyboard("{Meta>}z{/Meta}");

      expect(called).toBe(false);
      document.body.removeChild(textarea);
    });
  });
  ```

- [ ] **Step 2: Run the tests to verify they fail**

  Run: `npx vitest run web/src/keyboard/useKeyboardShortcuts.test.tsx`
  Expected: FAIL — the two "posts to" tests time out waiting for a request that's never made; the two "ignored" tests are vacuously true yet (nothing calls undo at all today), so write them expecting failure conceptually and confirm by temporarily checking the first two fail — the two guard tests will only become meaningful once Step 3 exists, which is fine: run the file and confirm the "posts to" tests fail with a timeout.

- [ ] **Step 3: Implement the wiring**

  In `web/src/keyboard/useKeyboardShortcuts.ts`, add the import and the two mutation hooks:

  ```ts
  import { useRedo, useRunCommand, useUndo } from "../queries/hooks.js";
  ```

  ```ts
  export function useKeyboardShortcuts(): void {
    const queryClient = useQueryClient();
    const runCommand = useRunCommand();
    const undo = useUndo();
    const redo = useRedo();

    useEffect(() => {
      // ...existing siblingsOf/createTodo unchanged...
  ```

  Add the new branch inside `onKeyDown`, before the existing `if (e.metaKey && e.key.toLowerCase() === "k")` check:

  ```ts
      if (e.metaKey && e.key.toLowerCase() === "z") {
        const target = document.activeElement;
        const isTextField = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
        if (isTextField) return;
        e.preventDefault();
        if (e.shiftKey) {
          redo.mutate();
        } else {
          undo.mutate();
        }
        return;
      }
  ```

  Update the effect's dependency array to include the two new mutations:

  ```ts
    }, [queryClient, runCommand, undo, redo]);
  ```

- [ ] **Step 4: Run the tests to verify they pass**

  Run: `npx vitest run web/src/keyboard/useKeyboardShortcuts.test.tsx`
  Expected: PASS (all tests in the file, including the 4 new ones).

- [ ] **Step 5: Run the full suite and typecheck, then commit**

  ```bash
  npx vitest run
  npm run typecheck
  git add web/src/keyboard/useKeyboardShortcuts.ts web/src/keyboard/useKeyboardShortcuts.test.tsx
  git commit -m "Wire Cmd+Z/Cmd+Shift+Z to undo/redo, guarded against text-field focus"
  ```

---

### Task 5: `DetailPane` notes-override fix

**Files:**
- Modify: `web/src/components/DetailPane.tsx`
- Test: `web/src/components/DetailPane.test.tsx`

**Interfaces:**
- Consumes: nothing new — `useNode` (existing).
- Produces: no new exports — `DetailPane`'s props are unchanged.

- [ ] **Step 1: Write the failing test**

  Add to `web/src/components/DetailPane.test.tsx`. `renderWithProviders` (see
  `web/src/test/renderWithProviders.tsx`) returns its `QueryClient` alongside
  the RTL render result, which is how this test drives a change to the
  underlying node data without a remount — exactly the scenario undo
  creates (the query cache changes under an already-mounted `DetailPane`):

  ```ts
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
  ```

- [ ] **Step 2: Run the test to verify it fails**

  Run: `npx vitest run web/src/components/DetailPane.test.tsx`
  Expected: FAIL — the textarea keeps showing `"whole milk"` (the stale local override) instead of `"reverted by undo"`.

- [ ] **Step 3: Implement the fix**

  In `web/src/components/DetailPane.tsx`, add the import and the effect:

  ```ts
  import { useEffect, useState } from "react";
  ```

  ```ts
  export function DetailPane({ nodeId, parentId }: DetailPaneProps) {
    const { data: node } = useNode(nodeId);
    const runCommand = useRunCommand();
    const [notes, setNotes] = useState<string | null>(null);

    useEffect(() => {
      setNotes(null);
    }, [node?.notes]);

    if (!node) return null;
    // ...rest unchanged...
  ```

- [ ] **Step 4: Run the test to verify it passes**

  Run: `npx vitest run web/src/components/DetailPane.test.tsx`
  Expected: PASS (all tests in the file, including the new one).

- [ ] **Step 5: Run the full suite and typecheck, then commit**

  ```bash
  npx vitest run
  npm run typecheck
  git add web/src/components/DetailPane.tsx web/src/components/DetailPane.test.tsx
  git commit -m "Reset DetailPane's local notes override when the node's notes change underneath it"
  ```

---

### Task 6: Real-browser verification

- [ ] **Step 1:** Start the dev server + Vite (standalone Playwright script, same approach as Phases 2–4: `npm install --no-save playwright`, run a `.mjs` script from the project root so it resolves `playwright` from `node_modules`, `npm uninstall --no-save playwright` and clean up temp files/processes/the scratch DB afterward).
- [ ] **Step 2:** Seed a project with a todo via the API, then drive the real UI: rename the todo, confirm the rename shows; `⌘Z`, confirm the old title is back in the column; `⌘⇧Z`, confirm the new title is back. Open the todo's detail pane, edit its notes and blur, confirm the new notes show; `⌘Z`, confirm the detail pane (still open, not remounted) shows the reverted notes text — this is the specific bug Task 5 fixed, so verify it against a real browser, not just RTL. Trigger a rebalance (create enough same-parent siblings with a long sort key, same setup as the Phase 3 rebalance test) and confirm two `⌘Z`'s are needed to fully undo the visible create. Trash a node, then Empty Trash, then `⌘Z` and confirm nothing happens (stack was cleared).
- [ ] **Step 3:** Fix anything broken; clean up temp files/processes after.
- [ ] **Step 4:** Commit any fixes.

---

### Task 7: Progress log

- [ ] **Step 1:** Append a "Phase 5 — Undo/Redo Wiring" section to `docs/progress.md`, in the same style as the Phase 1–4 entries (what shipped, bugs/gaps the tests or real-browser pass actually caught, design decisions settled during the build, test counts, residual risk carried forward — including the disclosed `When`/`Deadline` staleness gap from the design doc).
- [ ] **Step 2:** Commit.

---

## Self-review notes

- **Spec coverage**: §7.3 (every command already inverts — nothing to build there), §7.4 (server-memory stack, dies on restart — Task 1/2), keyboard map's `⌘Z`/`⌘⇧Z` (§ keyboard table — Task 4) all have tasks. The three ambiguities resolved with the user during brainstorming (no rebalance-bundling, irreversible-clears-both-stacks, keyboard-only) are encoded directly in Task 1–2's tests, not left to implementer judgment.
- **Type consistency**: `UndoStack`'s `undo`/`redo` signatures (`(ctx, commandLog) => boolean`) match how Task 2 calls them; `useUndo`/`useRedo`'s mutation return shape (`{ ok: boolean }`) matches what Task 2's routes send and what Task 4 doesn't even need to inspect (it only calls `.mutate()`, ignoring the result — undo/redo is fire-and-forget from the keyboard, consistent with "no visible affordance").
- **No placeholders found.**
