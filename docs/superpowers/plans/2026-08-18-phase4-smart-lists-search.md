# Phase 4 — Smart Lists and Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Today, Logbook, and Trash become real, navigable smart lists; `⌘K` opens a fuzzy search palette backed by FTS5.

**Architecture:** New read-only queries per view, an FTS5 virtual table synced via triggers (schema, not application code), a new `PurgeNode` command for single-item permanent delete, and dedicated non-`Column` view components on the frontend. Full design rationale: `docs/superpowers/specs/2026-08-18-phase4-smart-lists-search-design.md`.

## Global Constraints

- No SQL outside `repo/`; no database write outside `commands/` (unchanged).
- **Resolved with the user:** Today is grouped by parent project (sections), ordered within each group by overdue-deadline-first, then deadline ascending, then when_date ascending, then sort_key. Groups themselves are ordered by their most urgent contained item's rank.
- **Disclosed approximation:** Logbook groups derived-complete projects by their `updated_at` (the closest available signal — nothing in the schema stamps "when a project's derived-complete status flipped"). Flag this in the progress log, not silently.
- `PurgeNode` and `EmptyTrash` are irreversible (`invert()` throws `NotInvertibleError`); `RestoreNode` is a normal invertible command joining the HTTP-exposed set.
- "Fuzzy" search means FTS5 prefix/token matching, not typo correction — no additional SQLite extensions are assumed available.

---

### Task 1: FTS5 virtual table + sync triggers

**Files:**
- Create: `db/migrations/0004_fts5.sql`
- Test: `test/db/migrate.test.ts` (extend), `test/repo/sqliteNodeRepository.test.ts` (extend, or a new `test/repo/search.test.ts`)

**Interfaces:**
- Produces: a `nodes_fts` FTS5 virtual table indexing `title`, `notes`, with `content=''` (external-content-free, storing `id` as an unindexed column so it can be joined back to `nodes`), plus `AFTER INSERT`, `AFTER UPDATE`, `AFTER DELETE` triggers on `nodes` keeping it synced.
- Produces: `repo.searchCandidates(query: string): NodeRow[]` — runs the FTS5 `MATCH` query (each whitespace-separated term suffixed with `*` for prefix matching), joins back to `nodes`, returns full rows (no filtering yet — that's the query layer's job per the design doc).

- [ ] **Step 1: Write a failing test proving the FTS5 table exists and is queryable directly**
  ```ts
  it("keeps nodes_fts in sync with inserts, updates, and deletes", () => {
    const node = newNodeInput({ type: "todo", title: "Buy milk", notes: "2% please" });
    repo.insert(node);
    expect(repo.searchCandidates("milk").map((r) => r.id)).toContain(node.id);

    repo.updateTitle(node.id, "Buy oat milk", "2024-01-01T00:00:00.000Z");
    expect(repo.searchCandidates("oat").map((r) => r.id)).toContain(node.id);

    repo.hardDelete(node.id);
    expect(repo.searchCandidates("oat").map((r) => r.id)).not.toContain(node.id);
  });
  ```
  Run — expect `repo.searchCandidates is not a function` / missing table.

- [ ] **Step 2: Write the migration**
  ```sql
  CREATE VIRTUAL TABLE nodes_fts USING fts5(id UNINDEXED, title, notes);

  CREATE TRIGGER nodes_fts_ai AFTER INSERT ON nodes BEGIN
    INSERT INTO nodes_fts(id, title, notes) VALUES (new.id, new.title, new.notes);
  END;

  CREATE TRIGGER nodes_fts_ad AFTER DELETE ON nodes BEGIN
    DELETE FROM nodes_fts WHERE id = old.id;
  END;

  CREATE TRIGGER nodes_fts_au AFTER UPDATE ON nodes BEGIN
    DELETE FROM nodes_fts WHERE id = old.id;
    INSERT INTO nodes_fts(id, title, notes) VALUES (new.id, new.title, new.notes);
  END;
  ```

- [ ] **Step 3: Implement `repo.searchCandidates`**
  ```ts
  searchCandidates(query: string): NodeRow[] {
    const matchQuery = query.trim().split(/\s+/).filter(Boolean).map((t) => `${t}*`).join(" ");
    if (!matchQuery) return [];
    const rows = this.db
      .prepare(
        `SELECT nodes.* FROM nodes_fts
         JOIN nodes ON nodes.id = nodes_fts.id
         WHERE nodes_fts MATCH ?
         ORDER BY rank`,
      )
      .all(matchQuery) as RawNodeRow[];
    return rows.map(toNodeRow);
  }
  ```
  Run — expect pass.

- [ ] **Step 4: Run full suite + typecheck, commit.**

---

### Task 2: `getToday`, `getLogbook`, `getTrash` queries

**Files:**
- Create: `queries/getToday.ts`, `queries/getLogbook.ts`, `queries/getTrash.ts`
- Test: `test/queries/getToday.test.ts`, `test/queries/getLogbook.test.ts`, `test/queries/getTrash.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface TodayGroup { projectId: string; projectTitle: string; rows: ColumnRow[] }
  export function getToday(repo: NodeRepository, today: string): TodayGroup[]
  ```
  Candidates: `completed_at IS NULL AND deleted_at IS NULL AND (when_date <= today OR deadline <= today)`,
  ancestry-aware liveness filtered in JS (reusing `repo.getAncestorIds`, same pattern as
  every other ancestry check in this codebase). Grouped by `parent_id`; within each
  group sorted by `(deadline !== null && deadline < today) ? 0 : 1`, then `deadline`
  ascending (nulls last), then `whenDate` ascending (nulls last), then `sortKey`.
  Groups themselves sorted by their first (most urgent) row's same rank tuple.
- Produces:
  ```ts
  export interface LogbookGroup { day: string; rows: ColumnRow[] }
  export function getLogbook(repo: NodeRepository, ...): LogbookGroup[]
  ```
  Completed todos grouped by `completedAt`'s calendar-date prefix; derived-complete
  projects (per spec 3.4's formula, already computable via `hasLiveDescendant` +
  `openDescendantCount === 0`) grouped by `updatedAt`'s calendar-date prefix — the
  disclosed approximation from Global Constraints. Days ordered most-recent-first.
- Produces: `export function getTrash(repo: NodeRepository): ColumnRow[]` — thin
  wrapper over `repo.getTrashRoots()`, mapped to `ColumnRow` shape, ordered by
  `deletedAt` descending.

- [ ] **Step 1: Write failing tests for `getToday`** covering: an overdue-deadline todo
  sorts before a due-today one within the same group; two different projects each
  get their own group; a todo whose ancestor is trashed is excluded even though its
  own `deleted_at` is null; a todo with neither `when_date` nor `deadline` in range
  is excluded.
- [ ] **Step 2: Implement `getToday`.**
- [ ] **Step 3: Write failing tests for `getLogbook`** covering: a completed todo
  groups under its completion day; a derived-complete project groups under its
  `updated_at` day; an incomplete todo and a project with open descendants are both
  excluded; days are ordered most-recent-first.
- [ ] **Step 4: Implement `getLogbook`.**
- [ ] **Step 5: Write failing tests for `getTrash`** covering: a trashed root appears,
  a separately-trashed descendant of that root does not appear independently
  (already covered by `getTrashRoots` — this test just confirms the query-layer
  wrapper preserves that), ordering is `deletedAt` descending.
- [ ] **Step 6: Implement `getTrash`.**
- [ ] **Step 7: Run full suite + typecheck, commit.**

---

### Task 3: `getSearchResults` query with ancestry path

**Files:**
- Create: `queries/getSearchResults.ts`
- Test: `test/queries/getSearchResults.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface SearchResult {
    id: string; type: NodeType; title: string; notes: string;
    path: Array<{ id: string; type: NodeType }>; // nearest ancestor first, root last
  }
  export function getSearchResults(repo: NodeRepository, query: string): SearchResult[]
  ```
  Calls `repo.searchCandidates(query)`, then filters out any row whose own
  `deletedAt` is set or whose ancestor chain (`repo.getAncestorIds`) includes a
  trashed node — spec 5.4's explicit risk ("the failure mode is trashed items
  surfacing in ⌘K"). `path` is built by resolving each ancestor id to its
  `{id, type}` via `repo.getById`.

- [ ] **Step 1: Write failing tests**: a live matching todo is returned with its
  correct path; a trashed todo is excluded even though `nodes_fts` still indexes
  it; a live todo whose ancestor is trashed is excluded; results include matches
  from `notes`, not just `title`.
- [ ] **Step 2: Implement `getSearchResults`.**
- [ ] **Step 3: Run full suite + typecheck, commit.**

---

### Task 4: `PurgeNode` command

**Files:**
- Create: `commands/PurgeNode.ts`
- Test: `test/commands/purgeNode.test.ts`

**Interfaces:**
- `new PurgeNode(nodeId)` — `apply()` requires `repo.getById(nodeId)?.deletedAt !== null`
  (rejects purging a node that isn't itself a trash root — spec 3.6: purging a
  root purges its whole subtree, and a node that's merely *inside* an already-
  trashed ancestor's subtree isn't an independent purge target), then calls
  `repo.hardDeleteSubtree(nodeId)`. `invert()` throws `NotInvertibleError` (same
  pattern as `EmptyTrash`).

- [ ] **Step 1: Write failing tests**: purging a trash root with descendants
  removes the whole subtree; purging a node whose `deletedAt` is null throws;
  `invert()` throws `NotInvertibleError`.
- [ ] **Step 2: Implement `PurgeNode`.**
- [ ] **Step 3: Add an explicit exclusion comment in the invertibility property
  test (same treatment as `EmptyTrash`) — do not register it there.**
- [ ] **Step 4: Run full suite + typecheck, commit.**

---

### Task 5: Server routes — today/logbook/trash/search + newly exposed commands

**Files:**
- Modify: `server/app.ts`, `server/commandDispatch.ts`
- Test: `test/server/app.test.ts`

**Interfaces:**
- `GET /api/today`, `/api/logbook`, `/api/trash`, `/api/search?q=`.
- `commandDispatch.ts` gains `RestoreNode`, `EmptyTrash`, `PurgeNode` cases.

- [ ] **Step 1: Write failing tests for each new GET route** (200 with expected
  shape; `/api/search` with no `q` returns an empty array, not an error).
- [ ] **Step 2: Implement the four routes.**
- [ ] **Step 3: Write failing tests for the three newly-dispatched commands**
  (`RestoreNode` un-trashes; `EmptyTrash` purges everything; `PurgeNode` purges
  one root and rejects a non-root id with 400).
- [ ] **Step 4: Implement the dispatch cases.**
- [ ] **Step 5: Run full suite + typecheck, commit.**

---

### Task 6: `TodayView`, `LogbookView`, `TrashView` + Sidebar wiring

**Files:**
- Create: `web/src/components/TodayView.tsx`, `LogbookView.tsx`, `TrashView.tsx`
- Modify: `web/src/components/Sidebar.tsx`, `web/src/App.tsx`, `web/src/queries/hooks.ts` (add `useToday`/`useLogbook`/`useTrash`)
- Test: matching `.test.tsx` files, `Sidebar.test.tsx` (extend)

**Interfaces:**
- Sidebar's Today/Logbook/Trash rows become clickable, setting a new UI-store
  field (e.g. `activeSmartList: "today" | "logbook" | "trash" | null`) instead
  of `select()` (they're not part of the project open-path).
- `App.tsx` renders the corresponding view instead of `ColumnStack` when a
  smart list is active.
- `TrashView` rows get Restore and Permanent Delete buttons (the latter behind
  a confirmation); a page-level Empty Trash button, also confirmed.

- [ ] **Step 1: Write failing tests for each view** rendering stubbed grouped
  data with section headers.
- [ ] **Step 2: Implement each view.**
- [ ] **Step 3: Write failing tests for Sidebar → App wiring**: clicking Today
  shows `TodayView` instead of the column stack; selecting a project afterward
  switches back.
- [ ] **Step 4: Implement the wiring.**
- [ ] **Step 5: Run full suite + typecheck, commit.**

---

### Task 7: `⌘K` search palette

**Files:**
- Create: `web/src/components/SearchPalette.tsx`
- Modify: `web/src/App.tsx`, `web/src/keyboard/useKeyboardShortcuts.ts` (or a small dedicated hook for `⌘K`)
- Test: `web/src/components/SearchPalette.test.tsx`

**Interfaces:**
- `⌘K` opens the palette (a modal); typing queries `/api/search` (debounced);
  arrow keys move selection; Enter selects a result — sets the open path from
  its carried `path` and closes the palette; Escape closes without selecting.

- [ ] **Step 1: Write failing tests**: `⌘K` opens the palette; typing shows
  stubbed results; Enter on a result sets `openPath` to match its `path` and
  closes the palette; Escape closes without changing `openPath`.
- [ ] **Step 2: Implement `SearchPalette` and its `⌘K` trigger.**
- [ ] **Step 3: Run full suite + typecheck, commit.**

---

### Task 8: Real-browser verification

- [ ] **Step 1:** Start the dev server + Vite (standalone Playwright script,
  same approach as Phases 2–3).
- [ ] **Step 2:** Seed a todo due today, a completed todo, and a trashed todo
  via the API; drive: Today shows the due-today item grouped under its
  project; Logbook shows the completed item under today's date; Trash shows
  the trashed item with working Restore and Permanent Delete; `⌘K` finds a
  todo by a notes-only match and opens its full column path on Enter.
- [ ] **Step 3:** Fix anything broken; clean up temp files/processes after.
- [ ] **Step 4:** Commit any fixes.

---

### Task 9: Progress log

- [ ] **Step 1:** Append a "Phase 4 — Smart Lists and Search" section to
  `docs/progress.md`, explicitly re-flagging the Logbook project-grouping
  approximation and any other gaps found.
- [ ] **Step 2:** Commit.

---

## Self-review notes

- **Spec coverage**: Today's exact filter/order (§4), Logbook's grouping (§4),
  Trash's restore/purge/empty (§4, §3.6), FTS5 sync + ancestry-safe search
  (§5.4) all have tasks.
- **Type consistency**: `SearchResult`'s `path` shape (`{id, type}[]`) matches
  `OpenPathEntry` closely enough for the palette to feed directly into
  `useUiStore`'s `select()` calls — confirmed no redeclaration drift when
  implementing Task 7.
- **No placeholders found.**
