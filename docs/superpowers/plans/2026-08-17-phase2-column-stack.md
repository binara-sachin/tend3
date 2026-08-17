# Phase 2 — Column Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working column-stack UI (sidebar, columns, detail pane, keyboard nav, inline rename) backed by a real HTTP API over the Phase 1 command/query layers.

**Architecture:** Express server (`server/`) exposes `GET /api/columns/:parentId`, `GET /api/nodes/:id`, and `POST /api/commands`; Vite+React frontend (`web/`) renders the column stack with TanStack Query for server state and Zustand (localStorage-persisted) for UI state. Full design rationale: `docs/superpowers/specs/2026-08-17-phase2-column-stack-design.md`.

**Tech Stack:** Express, supertest (server tests); Vite, React, TypeScript, TanStack Query, Zustand, MSW + React Testing Library (frontend tests).

## Global Constraints

- No SQL outside `repo/`; no database write outside `commands/` (unchanged from Phase 1 — the server layer only calls `queries/` and `executeCommand`, never `repo` or `Database` directly).
- No optimistic updates (spec §7.5): client waits for the command response, then invalidates.
- Exposed commands this phase: `CreateNode`, `RenameNode`, `SetNotes`, `SetWhen`, `SetDeadline`, `SetCompleted`, `TrashNode`. `MoveNode`, `RestoreNode`, `EmptyTrash`, `HardDeleteNode` are NOT exposed over HTTP yet.
- Column widths and open path persist to `localStorage`, not the database.
- Every task ends green: tests written first, watched fail, then pass; `npx tsc --noEmit` clean; commit before moving to the next task.

---

### Task 1: Backend reads — `hasLiveDescendant` + `getColumn` + `getNode`

**Files:**
- Modify: `repo/NodeRepository.ts`, `repo/SqliteNodeRepository.ts`
- Create: `queries/getColumn.ts`, `queries/getNode.ts`
- Test: `test/repo/sqliteNodeRepository.test.ts`, `test/queries/getColumn.test.ts`, `test/queries/getNode.test.ts`

**Interfaces:**
- Produces: `repo.hasLiveDescendant(id: string): boolean` — true if any node with `deleted_at IS NULL` exists anywhere beneath `id` (any type, any completion state) — needed for spec §3.4's completion formula's second clause.
- Produces:
  ```ts
  export interface ColumnRow {
    id: string; type: NodeType; title: string; isSystem: boolean;
    whenDate: string | null; deadline: string | null;
    completedAt: string | null;       // todos only
    isComplete: boolean | null;       // derived, projects only; null otherwise
    openDescendantCount: number;      // 0 for non-projects
  }
  export function getColumn(repo: NodeRepository, parentId: string | null): ColumnRow[]
  ```
- Produces:
  ```ts
  export interface NodeDetail {
    id: string; type: NodeType; title: string; notes: string;
    whenDate: string | null; deadline: string | null; completedAt: string | null;
  }
  export function getNode(repo: NodeRepository, id: string): NodeDetail | null
  ```

- [ ] **Step 1: Write failing repo test for `hasLiveDescendant`**
  ```ts
  it("is true when a live descendant exists at any depth", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    const heading = newNodeInput({ type: "heading", parentId: root.id });
    repo.insert(heading);
    const todo = newNodeInput({ type: "todo", parentId: heading.id, completedAt: "2024-01-01T00:00:00.000Z" });
    repo.insert(todo);
    expect(repo.hasLiveDescendant(root.id)).toBe(true);
  });

  it("is false for an empty or fully-trashed subtree", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    expect(repo.hasLiveDescendant(root.id)).toBe(false);
  });
  ```
  Run `npx vitest run test/repo/sqliteNodeRepository.test.ts` — expect `hasLiveDescendant is not a function`.

- [ ] **Step 2: Implement `hasLiveDescendant`**
  ```ts
  hasLiveDescendant(id: string): boolean {
    const row = this.db.prepare(
      `WITH RECURSIVE subtree(id) AS (
        SELECT id FROM nodes WHERE parent_id = ? AND deleted_at IS NULL
        UNION ALL
        SELECT n.id FROM nodes n JOIN subtree s ON n.parent_id = s.id WHERE n.deleted_at IS NULL
      ) SELECT COUNT(*) AS count FROM subtree`,
    ).get(id) as { count: number };
    return row.count > 0;
  }
  ```
  Add to `NodeRepository` interface. Run tests again — expect pass.

- [ ] **Step 3: Write failing test for `getColumn`** (`test/queries/getColumn.test.ts`)
  ```ts
  it("returns children ordered by sort_key, with derived completion for projects", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    const sub = newNodeInput({ type: "project", parentId: root.id, sortKey: "a" });
    repo.insert(sub);
    const todo = newNodeInput({ type: "todo", parentId: root.id, sortKey: "b" });
    repo.insert(todo);

    const rows = getColumn(repo, root.id);

    expect(rows.map((r) => r.id)).toEqual([sub.id, todo.id]);
    expect(rows[0]).toMatchObject({ type: "project", isComplete: false }); // empty subtree
    expect(rows[1]).toMatchObject({ type: "todo", isComplete: null, completedAt: null });
  });

  it("returns root-level projects when parentId is null", () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    expect(getColumn(repo, null).map((r) => r.id)).toContain(root.id);
    // Inbox (seeded by migrate) is also root-level and included.
  });
  ```
  Run — expect module-not-found failure.

- [ ] **Step 4: Implement `getColumn`**
  ```ts
  export function getColumn(repo: NodeRepository, parentId: string | null): ColumnRow[] {
    return repo.getChildren(parentId).map((n) => ({
      id: n.id, type: n.type, title: n.title, isSystem: n.isSystem,
      whenDate: n.whenDate, deadline: n.deadline, completedAt: n.completedAt,
      isComplete: n.type === "project" ? n.openDescendantCount === 0 && repo.hasLiveDescendant(n.id) : null,
      openDescendantCount: n.openDescendantCount,
    }));
  }
  ```
  Run — expect pass.

- [ ] **Step 5: Write failing test for `getNode`, then implement** (mirrors steps 3–4; `getNode` is a thin projection over `repo.getById`, returns `null` when missing).

- [ ] **Step 6: Run full suite + `tsc --noEmit`, commit**
  ```bash
  npx vitest run && npx tsc --noEmit
  git add repo/ queries/ test/
  git commit -m "Add hasLiveDescendant, getColumn, getNode queries for Phase 2 reads"
  ```

---

### Task 2: Server — command dispatch + routes

**Files:**
- Create: `server/db.ts` (opens/migrates the SQLite file, builds the shared `CommandContext` + `SqliteCommandLogRepository`), `server/commandDispatch.ts`, `server/app.ts`, `server/index.ts`
- Test: `test/server/app.test.ts`

**Interfaces:**
- Consumes: `executeCommand`, all command classes, `getColumn`, `getNode` from Task 1.
- Produces: `createApp(repo, ctx, commandLog): express.Express` — takes dependencies as parameters (not a module-level singleton), so tests build an app over an in-memory DB.
- Produces: `buildCommand(type: string, payload: unknown): Command` in `commandDispatch.ts`, throwing on an unknown/disallowed type.

- [ ] **Step 1: Write failing test for `GET /api/columns/:parentId`**
  ```ts
  it("returns a project's children", async () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    const res = await request(app).get(`/api/columns/${root.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns root-level projects for parentId 'root'", async () => {
    const res = await request(app).get("/api/columns/root");
    expect(res.status).toBe(200);
    expect(res.body.some((r: { isSystem: boolean }) => r.isSystem)).toBe(true); // Inbox
  });
  ```

- [ ] **Step 2: Implement the columns route** — `parentId === "root" ? null : parentId`, call `getColumn`, `res.json(rows)`.

- [ ] **Step 3: Write failing test for `GET /api/nodes/:id`** (200 with body on hit, 404 `{ error }` on miss).

- [ ] **Step 4: Implement the node route.**

- [ ] **Step 5: Write failing tests for `POST /api/commands`**
  ```ts
  it("creates a todo and returns it", async () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    const res = await request(app).post("/api/commands").send({
      type: "CreateNode",
      payload: { parentId: root.id, type: "todo", title: "Buy milk", notes: "", sortKey: "a0", whenDate: null, deadline: null },
    });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Buy milk");
  });

  it("returns 400 with the command's error message on a validation failure", async () => {
    const res = await request(app).post("/api/commands").send({
      type: "CreateNode",
      payload: { parentId: null, type: "todo", title: "", notes: "", sortKey: "a0", whenDate: null, deadline: null },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/root/i);
  });

  it("rejects a command type not exposed over HTTP", async () => {
    const res = await request(app).post("/api/commands").send({ type: "MoveNode", payload: {} });
    expect(res.status).toBe(400);
  });
  ```

- [ ] **Step 6: Implement `commandDispatch.ts` and the commands route.** `buildCommand` is a `switch` over an allow-list of the seven exposed command names; each case validates its payload shape (plain field presence checks, not a schema library — YAGNI at this scale) and calls the matching constructor, generating a fresh `id` via `ctx.genId()` for `CreateNode`. Route handler: `try { command.apply-via-executeCommand } catch (e) { res.status(400).json({ error: e.message }) }`, on success re-fetch and return the affected node via `getNode`.

- [ ] **Step 7: Wire `server/app.ts`** (route registration + JSON body parsing + a not-found 404 fallback) and `server/index.ts` (opens `data/tend.db`, runs `migrate`, builds real repos/ctx, calls `createApp(...).listen(PORT)`). Add `"dev:server"` / `"start"` npm scripts.

- [ ] **Step 8: Run full suite + typecheck, commit.**

---

### Task 3: Frontend scaffold + typed API client

**Files:**
- Create: `web/index.html`, `web/src/main.tsx`, `web/src/App.tsx` (placeholder), `vite.config.ts`, `web/src/api/client.ts`
- Modify: `vitest.config.ts` (add `test.environmentMatchGlobs: [["web/**/*.test.tsx", "jsdom"]]`), `package.json` (frontend deps + `"dev:web"` script)
- Test: `web/src/api/client.test.ts`

**Interfaces:**
- Produces: `getColumn(parentId: string | null): Promise<ColumnRow[]>`, `getNode(id: string): Promise<NodeDetail>`, `runCommand(type: string, payload: object): Promise<NodeDetail>` in `web/src/api/client.ts`, all typed against the shared `ColumnRow`/`NodeDetail` types (re-exported from `queries/` — safe to import server types into the frontend since this is one package, not a network boundary between separately-versioned services).

- [ ] **Step 1: Install deps**
  ```bash
  npm install express && npm install -D @types/express supertest @types/supertest
  npm install react react-dom zustand @tanstack/react-query
  npm install -D vite @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event msw
  ```
  Verify each installs cleanly (`npm ls <pkg>`).

- [ ] **Step 2: `vite.config.ts`** — `root: "web"`, `build.outDir: "../dist/web"`, dev `server.proxy: { "/api": "http://localhost:3001" }` (Express dev port).

- [ ] **Step 3: Write failing test for the API client** (`web/src/api/client.test.ts`), using MSW to stub `fetch`:
  ```ts
  it("getColumn fetches and parses the column's rows", async () => {
    server.use(http.get("/api/columns/root", () => HttpResponse.json([{ id: "x", type: "project", ... }])));
    const rows = await getColumn(null);
    expect(rows[0].id).toBe("x");
  });
  ```
  Set up `web/src/test/msw.ts` (server + handlers) and reference it from `vitest.config.ts`'s `setupFiles`.

- [ ] **Step 4: Implement `client.ts`** — thin `fetch` wrappers; `runCommand` throws with the server's `error` message on non-2xx.

- [ ] **Step 5: `web/index.html` + `main.tsx` + placeholder `App.tsx`** rendering `"Tend"` — enough to confirm the Vite build/dev server boots.

- [ ] **Step 6: Run `npx vitest run`, `npx tsc --noEmit`, `npm run dev:web` smoke check, commit.**

---

### Task 4: Zustand UI store

**Files:**
- Create: `web/src/store/uiStore.ts`
- Test: `web/src/store/uiStore.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface OpenPathEntry { id: string; type: "project" | "todo" }
  interface UiState {
    openPath: OpenPathEntry[];
    columnWidths: Record<number, number>;
    showCompleted: Record<string, boolean>; // keyed by parentId
    selection: Record<string, string>;      // keyed by parentId -> selected node id
    select(depth: number, entry: OpenPathEntry): void; // truncates openPath to depth, appends entry
    setColumnWidth(index: number, width: number): void;
    toggleShowCompleted(parentId: string): void;
    setSelection(parentId: string, nodeId: string): void;
  }
  ```
  Persisted via Zustand's `persist` middleware to `localStorage` under key `"tend-ui"`.

- [ ] **Step 1: Write failing test** — `select` truncates:
  ```ts
  it("truncates the open path when selecting at an earlier depth", () => {
    const { select } = useUiStore.getState();
    select(0, { id: "a", type: "project" });
    select(1, { id: "b", type: "project" });
    select(1, { id: "c", type: "project" }); // re-select at depth 1
    expect(useUiStore.getState().openPath.map((e) => e.id)).toEqual(["a", "c"]);
  });
  ```

- [ ] **Step 2: Implement the store** with Zustand's `create` + `persist`.

- [ ] **Step 3: Tests for `setColumnWidth`/`toggleShowCompleted`/`setSelection`** (each a one-line state-update assertion), implement.

- [ ] **Step 4: Run tests, typecheck, commit.**

---

### Task 5: TanStack Query hooks

**Files:**
- Create: `web/src/queries/hooks.ts`, `web/src/queries/queryClient.ts`
- Test: `web/src/queries/hooks.test.tsx`

**Interfaces:**
- Produces: `useColumn(parentId: string | null)`, `useNode(id: string | null)` (query key `["node", id]`, `enabled: id != null`), `useRunCommand()` — a mutation that on success invalidates `["columns", mutatedNode.parentId]` and, for every `{id}` in `useUiStore.getState().openPath`, `["columns", id]`.

- [ ] **Step 1: Write failing test** rendering a hook via a `QueryClientProvider` wrapper + MSW-stubbed endpoint, asserting `useColumn` resolves to the stubbed rows.

- [ ] **Step 2: Implement `useColumn`/`useNode`.**

- [ ] **Step 3: Write failing test for `useRunCommand`'s invalidation** — seed the query cache with a `["columns", parentId]` entry, run the mutation, assert that key is marked stale/refetched (`queryClient.getQueryState(key)?.isInvalidated`).

- [ ] **Step 4: Implement `useRunCommand`.**

- [ ] **Step 5: Run tests, typecheck, commit.**

---

### Task 6: `Column` + `ColumnStack` components

**Files:**
- Create: `web/src/components/Column.tsx`, `web/src/components/ColumnStack.tsx`
- Test: `web/src/components/Column.test.tsx`, `web/src/components/ColumnStack.test.tsx`

**Interfaces:**
- `Column` props: `{ parentId: string | null, depth: number }`. Renders rows from `useColumn`; row click calls `select(depth, {id, type})`; heading rows expand/collapse local state (no column open); Enter on a focused row enters inline-rename mode (calls `useRunCommand` with `RenameNode` on blur/Enter-confirm); ↑/↓ moves focus within the row list. A per-column "Show completed" toggle button reads/writes `showCompleted[parentId]` from the UI store (spec §5.2); when off (the default), rows with `completedAt` set are filtered out of the rendered list — filtering happens in `Column`, not in `getColumn`, so the toggle needs no network round-trip.
- `ColumnStack`: renders one `Column` per `openPath` entry (plus the root column at depth 0), each in a resizable `<div>` whose width comes from `columnWidths[depth]` (default 280px) and whose divider drag calls `setColumnWidth`; ←/→ moves focus between columns.

- [ ] **Step 1: Write failing `Column` render/interaction tests** (RTL): renders stubbed rows; clicking a project row calls `select`; Enter on the title puts it into an editable input; typing + Enter calls `runCommand("RenameNode", ...)`.

- [ ] **Step 2: Implement `Column`.**

- [ ] **Step 3: Write failing test for the "Show completed" toggle**: a completed todo row is hidden by default; clicking the toggle button reveals it (and re-hides it on a second click), without any `runCommand`/network call.

- [ ] **Step 4: Implement the toggle** (reads/writes `showCompleted` via the UI store from Task 4; filters `useColumn`'s rows before rendering).

- [ ] **Step 5: Write failing `ColumnStack` tests**: renders a column per open-path entry; selecting a project at depth 1 (via a simulated child `select` call) truncates and adds depth 2; arrow-key focus moves between column containers.

- [ ] **Step 6: Implement `ColumnStack`**, including the resize-divider drag handler (pointer events: `pointerdown` captures the starting width, `pointermove` computes the delta, `pointerup` commits via `setColumnWidth`).

- [ ] **Step 7: Run tests, typecheck, commit.**

---

### Task 7: `DetailPane` component

**Files:**
- Create: `web/src/components/DetailPane.tsx`
- Test: `web/src/components/DetailPane.test.tsx`

**Interfaces:**
- Props: `{ nodeId: string }`. Renders `useNode(nodeId)`'s notes (textarea, `SetNotes` on blur), `when`/`deadline` (date inputs, `SetWhen`/`SetDeadline` on change).

- [ ] **Step 1: Write failing tests** — renders stubbed notes/dates; editing the textarea and blurring calls `runCommand("SetNotes", ...)`; changing the date input calls `runCommand("SetWhen", ...)`.
- [ ] **Step 2: Implement `DetailPane`.**
- [ ] **Step 3: Run tests, typecheck, commit.**

---

### Task 8: `Sidebar` component

**Files:**
- Create: `web/src/components/Sidebar.tsx`
- Test: `web/src/components/Sidebar.test.tsx`

**Interfaces:**
- Renders `useColumn(null)`'s rows as the root project list (Inbox included, styled distinctly via `isSystem`); clicking a row calls `select(0, {id, type: "project"})`; renders four static, disabled rows for Today/Logbook/Trash/(Inbox already covered) — actually three: Today, Logbook, Trash — labelled and non-interactive (spec: Inbox is a real node covered by the root list, per design doc's decision).

- [ ] **Step 1: Write failing tests** — renders Inbox + root projects from stubbed data; Today/Logbook/Trash render but clicking them does nothing (no `select` call).
- [ ] **Step 2: Implement `Sidebar`.**
- [ ] **Step 3: Run tests, typecheck, commit.**

---

### Task 9: App-level keyboard shortcuts

**Files:**
- Create: `web/src/keyboard/useKeyboardShortcuts.ts`
- Test: `web/src/keyboard/useKeyboardShortcuts.test.tsx`

**Interfaces:**
- A hook mounted once at the app root, reading current selection from `useUiStore`, dispatching on `keydown`: Space → `SetCompleted` toggle on the selected todo; ⌘N → `CreateNode` sibling below selection; ⌘⇧N → `CreateNode` child inside the selected project; ⌘⌫ → `TrashNode` on the selection. (←→↑↓ and Enter are handled locally by `Column`/`ColumnStack` from Task 6, not here.)

- [ ] **Step 1: Write failing tests** — simulate `keydown` events (via `userEvent.keyboard`) with a selected todo in the store, assert the right `runCommand` call for each shortcut.
- [ ] **Step 2: Implement the hook.**
- [ ] **Step 3: Run tests, typecheck, commit.**

---

### Task 10: App root wiring

**Files:**
- Modify: `web/src/App.tsx`, `web/src/main.tsx`

**Interfaces:**
- `App` renders `Sidebar` + `ColumnStack` + (conditionally) `DetailPane` when the open path's last entry is a todo; wraps everything in `QueryClientProvider`; mounts `useKeyboardShortcuts()` once.

- [ ] **Step 1: Write a failing integration-ish RTL test** (stub the three GET/POST endpoints via MSW): renders `App`, clicking a root project row shows that project's children.
- [ ] **Step 2: Implement `App.tsx` wiring.**
- [ ] **Step 3: Run tests, typecheck, commit.**

---

### Task 11: Production build + static serving

**Files:**
- Modify: `server/app.ts` (serve `dist/web` as static files, SPA fallback to `index.html` for non-`/api` routes), `package.json` (`"build"` script: `vite build && tsc -p server`, or a single `tsc --noEmit` since server runs via a Node loader — decide based on what's already working in Task 2's `dev:server` script)

- [ ] **Step 1: Add static-serving middleware + SPA fallback**, guarded so it's a no-op (or serves a "run `npm run build`" message) when `dist/web` doesn't exist yet, to keep `test/server/app.test.ts` passing without requiring a built frontend.
- [ ] **Step 2: Run `npm run build`, then `npm run start`, curl `/` and confirm the built `index.html` is served; curl an `/api/columns/root` route and confirm it still works.**
- [ ] **Step 3: Run full suite + typecheck, commit.**

---

### Task 12: Playwright golden-path verification

- [ ] **Step 1:** Start `npm run dev:server` and `npm run dev:web` (or the combined dev script if Task 11 added one).
- [ ] **Step 2:** Using Playwright, navigate to the dev URL and drive: open a root project → see its column → create a todo (⌘N) → rename it inline (Enter) → mark it complete (Space) → trash it (⌘⌫) → confirm it disappears from the column.
- [ ] **Step 3:** Fix anything broken; re-run until the golden path passes cleanly. Take a screenshot for the record.
- [ ] **Step 4:** Commit any fixes.

---

### Task 13: Progress log

- [ ] **Step 1:** Append a "Phase 2 — Column Stack" section to `docs/progress.md`: what shipped, test counts, any bugs the tests caught, residual gaps (e.g. no drag-and-drop yet, Today/Logbook/Trash are placeholders).
- [ ] **Step 2:** Commit.

---

## Self-review notes

- **Spec coverage**: sidebar (§1, §5.1), column truncation/expansion (§5.1), completed-item visibility toggle (§5.2 — note: `showCompleted` state exists in the store from Task 4, but no task above wires it into `Column`'s row filtering or a visible toggle button; **added as an explicit step inside Task 6** rather than left implicit) — see Task 6 update below.
- **Type consistency**: `ColumnRow`/`NodeDetail` defined once in `queries/` (Task 1) and reused verbatim by the server routes (Task 2) and the frontend client (Task 3) — no re-declaration drift.
- **No placeholders found** beyond the above, which is now fixed.
