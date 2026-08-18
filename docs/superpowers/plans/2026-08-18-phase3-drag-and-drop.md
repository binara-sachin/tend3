# Phase 3 — Drag and Drop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drag-and-drop reordering and reparenting in the column stack, backed by a real `MoveNode` HTTP endpoint and a `rebalance()` mitigation for fractional-index key growth.

**Architecture:** `@dnd-kit/core` + `@dnd-kit/sortable`, one `DndContext` spanning the whole `ColumnStack`, one `SortableContext` per column. A new invertible `Rebalance` command renumbers a parent's children when triggered. Full design rationale: `docs/superpowers/specs/2026-08-18-phase3-drag-and-drop-design.md`.

## Global Constraints

- No SQL outside `repo/`; no database write outside `commands/` (unchanged).
- Every command still has `apply()`/`invert()` — `Rebalance` included, since
  unlike `EmptyTrash` its change (key strings only, not order) is fully
  reversible.
- `MoveNode` is the only structural command newly exposed over HTTP this
  phase.
- Rebalance threshold: 50 characters on any sibling's `sort_key`.
- Keyboard-sensor-driven tests (RTL + `userEvent.keyboard`) are the primary
  automated coverage per spec §8; one real-browser Playwright pass at the
  end covers what those structurally can't (pointer visuals, autoscroll).

---

### Task 1: `Rebalance` command

**Files:**
- Create: `commands/Rebalance.ts`
- Modify: `lib/sortKey.ts` (add `evenlySpacedKeys(count)`), `repo/NodeRepository.ts`, `repo/SqliteNodeRepository.ts` (add `updateSortKey`)
- Test: `test/lib/sortKey.test.ts`, `test/repo/sqliteNodeRepository.test.ts`, `test/commands/rebalance.test.ts`

**Interfaces:**
- Produces: `evenlySpacedKeys(count: number): string[]` in `lib/sortKey.ts`,
  wrapping `fractional-indexing`'s own `generateNKeysBetween(null, null, count)`.
- Produces: `repo.updateSortKey(id: string, sortKey: string, updatedAt: string): void` —
  updates only `sort_key`/`updated_at`, leaving `parent_id` untouched (distinct
  from `updateParentAndSortKey`, which `MoveNode` needs for the parent-change case).
- Produces: `new Rebalance(parentId: string)` — `apply()` fetches
  `repo.getChildren(parentId)` (all children, any status — order applies
  regardless of completion/trash state), captures each child's `(id, sortKey)`,
  computes `evenlySpacedKeys(children.length)`, and calls `updateSortKey` for
  each child in its existing order. `invert()` restores the captured original
  keys.

- [ ] **Step 1: Write failing test for `evenlySpacedKeys`**
  ```ts
  it("returns N keys in ascending order", () => {
    const keys = evenlySpacedKeys(5);
    expect(keys).toHaveLength(5);
    expect([...keys].sort()).toEqual(keys);
  });

  it("returns an empty array for zero children", () => {
    expect(evenlySpacedKeys(0)).toEqual([]);
  });
  ```
  Run `npx vitest run test/lib/sortKey.test.ts` — expect `evenlySpacedKeys is not defined`.

- [ ] **Step 2: Implement `evenlySpacedKeys`**
  ```ts
  import { generateNKeysBetween } from "fractional-indexing";
  export function evenlySpacedKeys(count: number): string[] {
    return generateNKeysBetween(null, null, count);
  }
  ```
  Run — expect pass.

- [ ] **Step 3: Write failing repo test for `updateSortKey`**
  ```ts
  it("updates only sort_key and updated_at, leaving parent_id untouched", () => {
    const parent = newNodeInput({ type: "project" });
    repo.insert(parent);
    const node = newNodeInput({ type: "todo", parentId: parent.id, sortKey: "a" });
    repo.insert(node);

    repo.updateSortKey(node.id, "z", "2024-02-01T00:00:00.000Z");

    const row = repo.getById(node.id);
    expect(row?.sortKey).toBe("z");
    expect(row?.parentId).toBe(parent.id);
    expect(row?.updatedAt).toBe("2024-02-01T00:00:00.000Z");
  });
  ```
  Run — expect `repo.updateSortKey is not a function`.

- [ ] **Step 4: Implement `updateSortKey`** on the interface and
  `SqliteNodeRepository` (mirrors `updateTitle`'s shape exactly, just the
  `sort_key` column).

- [ ] **Step 5: Write failing tests for `Rebalance`** (`test/commands/rebalance.test.ts`)
  ```ts
  it("renumbers all children evenly, preserving their existing order", () => {
    const parent = newNodeInput({ type: "project" });
    repo.insert(parent);
    const a = newNodeInput({ type: "todo", parentId: parent.id, sortKey: "a" });
    const b = newNodeInput({ type: "todo", parentId: parent.id, sortKey: "b" });
    repo.insert(a);
    repo.insert(b);

    new Rebalance(parent.id).apply(ctx);

    const [first, second] = repo.getChildren(parent.id);
    expect(first?.id).toBe(a.id);
    expect(second?.id).toBe(b.id);
    expect(first!.sortKey < second!.sortKey).toBe(true);
  });

  it("invert() restores the exact prior sort_key for every affected child", () => {
    const parent = newNodeInput({ type: "project" });
    repo.insert(parent);
    const a = newNodeInput({ type: "todo", parentId: parent.id, sortKey: "a" });
    repo.insert(a);
    const command = new Rebalance(parent.id);

    command.apply(ctx);
    command.invert().apply(ctx);

    expect(repo.getById(a.id)?.sortKey).toBe("a");
  });

  it("throws if invert() is called before apply()", () => {
    expect(() => new Rebalance("some-id").invert()).toThrow(/apply/i);
  });
  ```
  Run — expect module-not-found failure.

- [ ] **Step 6: Implement `Rebalance`**, following the existing command
  pattern exactly (capture prior state in `apply()`, `invert()` reconstructs
  from it, `toPayload()` returns `{ parentId }`).

- [ ] **Step 7: Register `Rebalance` in the invertibility property test**
  (`test/commands/invertibility.property.test.ts`) — `build()` picks any
  non-leaf project id from the seeded forest with at least one child.

- [ ] **Step 8: Run full suite + typecheck, commit.**

---

### Task 2: Expose `MoveNode` + auto-rebalance over HTTP

**Files:**
- Modify: `server/commandDispatch.ts`, `server/app.ts`
- Test: `test/server/app.test.ts`

**Interfaces:**
- `buildCommand` gains a `"MoveNode"` case: payload `{ nodeId, newParentId, newSortKey }`.
- The `POST /api/commands` handler, after a successful `CreateNode` or
  `MoveNode`, checks the affected parent's children (`repo.getChildren`) for
  any `sort_key` longer than 50 chars; if found, runs `Rebalance` as a
  *separate* `executeCommand` call (its own transaction and `command_log`
  entry) — kept decoupled from the triggering command's own invert() so
  `CreateNode`/`MoveNode`'s invertibility is untouched by it.

- [ ] **Step 1: Write failing test — MoveNode now works over HTTP**
  ```ts
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
  ```
  (This replaces the existing "rejects a command type not exposed over HTTP"
  test's use of `MoveNode` as the not-exposed example — swap that test to
  use `RestoreNode` instead, still not exposed.)

- [ ] **Step 2: Add the `MoveNode` case to `buildCommand`.** Run — expect pass.

- [ ] **Step 3: Write failing test for auto-rebalance**
  ```ts
  it("rebalances a parent's children after an insert grows a sort_key past the threshold", async () => {
    const root = newNodeInput({ type: "project" });
    repo.insert(root);
    const long = newNodeInput({ type: "todo", parentId: root.id, sortKey: "a".repeat(51) });
    repo.insert(long);

    await request(app).post("/api/commands").send({
      type: "CreateNode",
      payload: { parentId: root.id, type: "todo", title: "x", notes: "", sortKey: "b", whenDate: null, deadline: null },
    });

    const children = repo.getChildren(root.id);
    expect(children.every((c) => c.sortKey.length <= 50)).toBe(true);
  });
  ```

- [ ] **Step 4: Implement the auto-rebalance check in the `POST /api/commands` handler.** Run — expect pass.

- [ ] **Step 5: Run full suite + typecheck, commit.**

---

### Task 3: dnd-kit scaffold — draggable rows, reorder within one column

**Files:**
- Modify: `package.json` (deps), `web/src/components/ColumnStack.tsx`, `web/src/components/Column.tsx`
- Test: `web/src/components/Column.test.tsx`

**Interfaces:**
- `ColumnStack` wraps its columns in a single `DndContext` (sensors:
  `PointerSensor` + `KeyboardSensor` from `@dnd-kit/core`).
- Each `Column`'s row list is a `SortableContext` (`@dnd-kit/sortable`,
  `verticalListSortingStrategy`), items keyed by row id.
- Each row uses `useSortable({ id: row.id })`.

- [ ] **Step 1: Install `@dnd-kit/core` and `@dnd-kit/sortable`**, verify clean install.

- [ ] **Step 2: Write a failing keyboard-sensor test**: renders `ColumnStack`
  with two todos in one column; focuses the first row; presses Space
  (pick up), ArrowDown, Space (drop); asserts a `MoveNode` POST fired with
  the expected `nodeId` and a `newSortKey` that sorts after the second
  row's original key.

- [ ] **Step 3: Wire `DndContext`/`SortableContext`/`useSortable`** so the
  keyboard sensor test passes. `onDragEnd` computes the new sort key via
  `sortKeyBetween`/`sortKeyAfter` from the drop position within the same
  column's row array, then calls `useRunCommand()`'s `mutate` with
  `MoveNode`.

- [ ] **Step 4: Run tests, typecheck, commit.**

---

### Task 4: Cross-column reparent + whole-row "drop into project" disambiguation

**Files:**
- Modify: `web/src/components/Column.tsx`, `web/src/components/ColumnStack.tsx`

**Interfaces:**
- Project rows additionally call `useDroppable({ id: `project-drop-${row.id}` })`.
- `DndContext`'s `collisionDetection` prefers a `project-drop-*` droppable
  when the pointer is within its row's central band (e.g. middle 60% of
  its height), falling back to the sortable's own edge-based insertion
  detection otherwise.
- `onDragEnd` branches on which kind of target won: whole-row → `MoveNode`
  with `newSortKey` appended (`sortKeyAfter(lastChild)` of the target
  project's current children); insertion line → `MoveNode` with
  `newSortKey` computed between the two rows the line sits between (which
  may belong to a *different* column than the dragged row started in).

- [ ] **Step 1: Write a failing keyboard-sensor test for whole-row reparent**:
  two projects in the same column, a todo in a third location; pick up the
  todo, arrow to the target project row, drop; assert a `MoveNode` POST
  with `newParentId` equal to the target project and a sort key placing it
  last among that project's (stubbed) children.

- [ ] **Step 2: Implement the whole-row droppable + collision priority.**

- [ ] **Step 3: Write a failing keyboard-sensor test for cross-column
  insertion**: two columns open, drag a row from column A to a specific
  position within column B's list; assert `MoveNode`'s `newParentId` is
  column B's parent id and `newSortKey` sits between the two rows it landed
  between.

- [ ] **Step 4: Implement cross-column insertion-line handling.**

- [ ] **Step 5: Run tests, typecheck, commit.**

---

### Task 5: Sidebar drop targets — Today, Inbox, Trash

**Files:**
- Modify: `web/src/components/Sidebar.tsx`
- Test: `web/src/components/Sidebar.test.tsx`

**Interfaces:**
- `Today`/`Inbox`/`Trash` rows each call `useDroppable({ id: "sidebar-today" | "sidebar-inbox" | "sidebar-trash" })`.
- `ColumnStack`'s (or a shared top-level) `onDragEnd` recognizes these ids
  and dispatches `SetWhen` (client-computed today's date), `MoveNode`
  (`newParentId: INBOX_ID`, appended), or `TrashNode` respectively, instead
  of the normal column-to-column logic.

- [ ] **Step 1: Write failing keyboard-sensor tests**, one per target:
  dropping a todo on Today fires `SetWhen` with today's calendar date;
  dropping on Inbox fires `MoveNode` targeting the Inbox id; dropping on
  Trash fires `TrashNode`. Dropping on Logbook does nothing (it has no
  droppable at all).

- [ ] **Step 2: Implement the three sidebar droppables and their dispatch.**

- [ ] **Step 3: Run tests, typecheck, commit.**

---

### Task 6: Real-browser verification

- [ ] **Step 1:** Start the dev server + Vite, using a standalone Playwright
  script against the package's own bundled Chromium (per Phase 2's approach
  — the MCP tool's `chrome`-channel requirement isn't installable here).
- [ ] **Step 2:** Drive: create two todos in a project, drag one below the
  other by pointer (not keyboard, to exercise the actual pointer path) and
  confirm the reorder persists after reload; drag a todo onto a project row
  and confirm it reparents; drag a todo onto the sidebar's Trash entry and
  confirm it's trashed.
- [ ] **Step 3:** Fix anything broken; re-run until clean. Clean up temp
  processes/files afterward (mirroring Phase 2's cleanup discipline).
- [ ] **Step 4:** Commit any fixes.

---

### Task 7: Progress log

- [ ] **Step 1:** Append a "Phase 3 — Drag and Drop" section to
  `docs/progress.md`: what shipped, bugs the tests/browser run caught,
  residual gaps.
- [ ] **Step 2:** Commit.

---

## Self-review notes

- **Spec coverage:** §6's two drop-target kinds (Tasks 3–4), sidebar action
  targets (Task 5), fractional-index rebalancing (Task 1–2), keyboard-sensor
  testing (§8, woven into Tasks 3–5's own test steps, plus a real-browser
  pointer-driven pass in Task 6) all have tasks. §6.1's rebalance risk is
  handled as an auto-triggered follow-up command, not a user-facing action,
  matching "call it when any key... exceeds a threshold."
- **Type consistency:** `MoveNode`'s payload shape (`nodeId`, `newParentId`,
  `newSortKey`) matches its existing constructor from Phase 1 exactly — no
  redefinition.
- **No placeholders found.**
