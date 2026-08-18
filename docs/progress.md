# Progress Log

## Phase 1 — Core

**Status: complete.** Schema, migrations, repository, command layer, command log,
and the invertibility property test are all built and passing.

### What shipped

- **Tooling**: Node + npm, TypeScript (strict, NodeNext), Vitest, fast-check
  for property-based testing. `better-sqlite3`, `uuidv7`, `fractional-indexing`
  verified to install and build cleanly in this environment.
- **`db/`**: numbered SQL migrations (`0001_init`, `0002_command_log`,
  `0003_seed_inbox`) applied via `PRAGMA user_version`. Inbox seeded as a
  fixed-id, `is_system` root project.
- **`repo/`**: `NodeRepository` interface + `SqliteNodeRepository`. All SQL in
  the project lives here (plus the migration files themselves, which are
  schema, not queries). Ancestor walks, cycle detection, ancestry-aware
  liveness, and count recomputation all live here.
- **`commands/`**: eleven commands, each with `apply()`/`invert()` —
  `CreateNode`, `HardDeleteNode`, `RenameNode`, `SetNotes`, `SetWhen`,
  `SetDeadline`, `SetCompleted`, `MoveNode`, `TrashNode`, `RestoreNode`,
  `EmptyTrash`. Every command's own `apply()` captures the prior state its
  `invert()` needs (including `updated_at`), so undo restores rows exactly,
  not just semantically. `EmptyTrash.invert()` throws `NotInvertibleError` by
  design (spec 7.3) rather than silently no-opping.
- **`executeCommand.ts`**: wraps every command's `apply()` and its
  `command_log` insert in one transaction (`repo.transaction(fn)`), so
  `commands/` never imports `Database` directly.
- **`queries/verifyCounts.ts`**: compares stored `open_descendant_count`
  against a from-scratch recompute; asserted after every test in every
  command test file via `afterEach`, plus after every apply/invert step in
  the property test.
- **Invertibility property test** (`test/commands/invertibility.property.test.ts`):
  a fast-check arbitrary generates random valid trees; for each of the ten
  invertible commands, apply → invert is checked against 500 random trees
  for exact `nodes`-table equality (`command_log` excluded — it's
  append-only by design) and count consistency. Each command's `build()` can
  legitimately find no valid target in a given random tree (e.g. `SetCompleted`
  needs a todo to exist) and skip that run rather than fail it — so the
  harness counts how many runs actually exercised the command and asserts
  that count exceeds half of `numRuns`, printed as `[coverage] <name>: built
  X/500` under `--reporter=verbose`. Measured: CreateNode, HardDeleteNode,
  RenameNode, SetNotes, SetWhen, SetDeadline, TrashNode, and RestoreNode hit
  500/500; SetCompleted hit 421/500; MoveNode hit 465/500. Without this
  guard, a `build()` that skipped every run would make its property pass
  vacuously and the "checked against 500 random trees" claim would be false.

### Bugs the tests actually caught mid-build

1. **Test fixture, not production**: `seedForest` (the property test's tree
   seeder) bypassed the command layer and left every project's
   `open_descendant_count` at its column default (0), which `verifyCounts`
   immediately flagged. Fixed by reconciling seeded counts via
   `recomputeOpenDescendantCounts()` right after seeding.
2. **Production bug**: `getAncestorProjectIds` walked past a trashed ancestor
   unconditionally, so a change several levels below a trashed node would
   have incorrectly adjusted a live ancestor's count above it. Not caught
   until `SetCompleted`/`TrashNode` made trashed ancestors possible in test
   fixtures. Fixed by stopping the walk at the first trashed ancestor
   (inclusive of that ancestor's own count, exclusive of anything beyond it).
3. **Production bug, same method**: the fix for #2 also (incorrectly) gated
   on the *starting* node's own `deleted_at`, so calling it mid-`RestoreNode`
   (while the node itself was still marked trashed) returned an empty
   ancestor list and silently skipped the count increment. Fixed by forcing
   the walk's base row to report `deleted_at = NULL` regardless of the
   starting node's actual value — only ancestors above it gate the walk.

4. **`verifyCounts` gap, not a live bug**: `recomputeOpenDescendantCounts()`
   only maps `project` rows, so a stray nonzero `open_descendant_count` on a
   `todo` or `heading` row (unreachable today, since `adjustOpenDescendantCount`
   is only ever fed project ids — but exactly the kind of drift spec 3.4
   calls this routine load-bearing for) was invisible to the check. Added
   `getNonProjectRowsWithNonzeroCount()` and wired it into `verifyCounts` so
   it's covered.

All four were caught by tests (or, for #4, by review before being reported
as done) — none were found by manual inspection alone.

### Design decisions settled during the build (approved by the user before implementation)

- `EmptyTrash.invert()` exists (satisfying "every command has apply/invert")
  but throws `NotInvertibleError`; excluded by name from the property test
  with a comment citing spec 7.3.
- Migration `.sql` files in `db/` are schema, not application queries — "no
  SQL outside repo/" governs hand-authored CRUD, not DDL/seed migrations.
- `open_descendant_count` counts live, incomplete `todo` descendants only,
  transitively through headings and sub-projects (both pass-through); a
  project containing only an empty sub-project is vacuously complete, same
  shape as spec 3.4's own accepted trade-off one level deeper.
- "Byte-identical" (spec 8) means full row equality on `nodes`, timestamps
  included, achieved by having `apply()` capture whatever `invert()` needs
  (not by excluding fields from comparison); `command_log` is excluded from
  the comparison since it's append-only by design.
- Inbox (`is_system`) rejects `RenameNode`/`MoveNode`/`TrashNode`
  (spec 3.5's literal wording) but allows `SetNotes`/`SetWhen`/`SetDeadline`
  — only structural operations are blocked.

### Test counts

137 tests, 19 files, all passing. `npx tsc --noEmit` clean.

### Residual risk / known coverage gaps carried into later phases

- `getAncestorProjectIds`'s trashed-boundary semantics (bug #2/#3 above) is
  exactly the kind of interaction that gets harder to reason about once drag
  and drop (Phase 3) makes trashing and moving happen in close succession
  from the UI. Worth revisiting with fresh eyes once real usage patterns
  exist.
- `rebalance(parentId)` (spec 6.1's fractional-index growth mitigation) is
  deliberately not built yet — Phase 1 has no repeated-insert-at-top usage
  pattern to trigger it. Needed before Phase 3 ships.
- The fixture generator (`test/fixtures/buildTree.ts`) never generates a
  project or heading nested under a heading (only todos, conservatively —
  see the comment there). "A heading may contain a sub-project" is allowed
  by the enforced invariants and by `CreateNode`/`MoveNode`'s validation
  logic, but that specific shape is never exercised by the property test.
  Worth widening the generator if this shape turns out to matter in
  practice.
- **Disclosure, not an oversight**: spec 3.3 says the structural invariants
  are "enforced in the command layer; mirrored as CHECK constraints and
  triggers **where SQLite permits**." Only the schema's own `type IN (...)`
  CHECK exists at the DB level — "heading's parent must be a project," "todo
  has no children," and "root nodes are always project" are enforced solely
  in `commands/`, with no SQLite trigger mirror. The command layer is
  complete and tested, and the clause is explicitly hedged, so this is
  believed to be an acceptable Phase 1 scope cut rather than a bug — but it
  was never explicitly signed off, so flagging it now rather than letting it
  pass silently.
- `command_log` payloads (`toPayload()`) capture the command's *input*
  parameters, not the internal `updatedAtOverride` some inverses use to
  restore an exact prior timestamp. Undo in v1 never replays from
  `command_log` (it uses the in-memory command object directly), so this
  doesn't affect v1 behavior. It would matter for spec 10's future op-log
  replay: replaying a logged `RenameNode` payload verbatim would stamp a new
  `updated_at` rather than reproducing the original exactly. Deferred, not
  lost — worth revisiting when the sync work in spec 10 actually starts.

## Phase 2 — Column Stack

**Status: complete.** Full design rationale in
`docs/superpowers/specs/2026-08-17-phase2-column-stack-design.md`; plan in
`docs/superpowers/plans/2026-08-17-phase2-column-stack.md`.

### What shipped

- **`server/`**: Express app. `GET /api/columns/:parentId` (`root` sentinel
  for the root-level project list), `GET /api/nodes/:id`, and a single
  `POST /api/commands` dispatch endpoint covering the seven commands exposed
  this phase (`CreateNode`, `RenameNode`, `SetNotes`, `SetWhen`,
  `SetDeadline`, `SetCompleted`, `TrashNode`). `MoveNode` (Phase 3's job),
  `RestoreNode`/`EmptyTrash` (Phase 4's Trash view), and `HardDeleteNode`
  (an inverse only) are not reachable over HTTP. `TrashNode`'s `deletedAt`
  and `SetCompleted`'s `completedAt` are always server time, never
  client-supplied, per spec 7.5. Serves the built frontend from `dist/web`
  with an SPA fallback once `npm run build` has run.
- **`queries/getColumn.ts` + `getNode.ts`**: the two reads the UI needs,
  plus `repo.hasLiveDescendant()` for spec 3.4's completion formula.
- **`web/`**: Vite + React + TypeScript. TanStack Query for server state
  (`useColumn`, `useNode`, `useRunCommand`); a Zustand store, persisted to
  `localStorage`, for pure UI state (open path, column widths,
  show-completed per column, active selection, focused column).
  `Sidebar` (Inbox + root projects; Today/Logbook/Trash as inert
  placeholders until Phase 4), `ColumnStack` (resizable columns via pointer
  events, truncation on selection), `Column` (row rendering, inline rename,
  per-column show-completed toggle, heading expand/collapse), `DetailPane`
  (notes/when/deadline editing), and an app-level keyboard-shortcuts hook
  (Space, Cmd+N, Cmd+Shift+N, Cmd+Backspace — Cmd+K and undo/redo are
  Phases 4/5).

### Bugs the tests — and one real browser run — actually caught

1. **`getAncestorProjectIds` bug, third time**: while building
   `useRunCommand`'s invalidation strategy, re-examined the same method
   fixed twice in Phase 1 (see that section) to confirm the fix actually
   covers the cache-invalidation use case too. No new defect this time —
   confirms the fix holds, not a new bug.
2. **`ColumnStack` duplicated the sidebar's root-project list.** Spec §1
   says the sidebar renders depth 0 of the tree; `ColumnStack` was also
   rendering a "root" column showing the same projects, and — more
   seriously — passing the wrong `depth` to `Column`'s `select()` calls, so
   selecting a project inside the *first* stack column overwrote the open
   path instead of extending it (`select(0, …)` truncates to nothing, not
   `select(1, …)`). Caught by `App.test.tsx`'s integration-level test, not
   by `Column`'s or `ColumnStack`'s own isolated tests — neither exercised
   the seam between them. Fixed: the stack starts at the first selection's
   children; each column's depth is `index + 1`.
3. **Cmd+N was a silent no-op in an empty column.** It read its target
   parent from `activeSelection`, which is `null` until some row has been
   clicked — exactly the state of a brand-new, empty project. Every
   existing keyboard-shortcut test had already selected a row before
   testing Cmd+N, so none caught it. Found by walking through the actual
   golden path by hand before scripting it. Fixed by adding
   `focusedColumnParentId` (set on column mount/click, independent of row
   selection) as Cmd+N's fallback target.
4. **`getColumn` never filtered trashed nodes.** `TrashNode` correctly sets
   `deleted_at`, but the column kept showing the row regardless — no test
   had ever inserted a trashed row into a column and checked it was
   excluded. Fixed at the query layer, not `repo.getChildren` (which
   `HardDeleteNode`'s orphan-check correctly needs to see *all* children,
   trashed or not, to avoid orphaning a separately-trashed child).
5. **Empty-titled rows were invisible to real browser interaction.** A
   freshly created node has `title: ""`, which collapsed its row to zero
   height — present in the DOM, un-clickable in practice. jsdom-based
   component tests never noticed (no real layout engine). Caught only by
   driving a real Chromium browser against the real dev server. Fixed with
   a `minHeight` on row elements.
6. **A missing test helper file was never committed.** `renderWithProviders.tsx`
   had been imported by five component test files since the `Column`/
   `ColumnStack` task, but `git add` never picked it up — those tests only
   passed because the untracked file happened to still be on disk. Caught
   by `git status` showing an unexpected untracked file three tasks later.
   Verified the fix by testing a fresh clone from a clean checkout.

Bugs 2, 3, 5, and 6 were found only by integration-level or real-browser
verification — none of the unit-level test suites in isolation would have
caught them. This is the concrete case for the plan's "before declaring
done: start the real dev server and drive it with Playwright" step; skipping
straight from green unit tests to "done" would have shipped four of six
bugs in this phase.

### Playwright note

The bundled Playwright MCP tool requires a `chrome`-channel binary, which
cannot be installed on Linux ARM64 (`sbx`'s host arch here). Verified the
golden path with a standalone script using the `playwright` npm package's
own bundled Chromium instead (installed temporarily via `npm install
--no-save`, removed after). If this environment's arch changes or a
`chrome` binary becomes available, the MCP tool should work directly.

### Design decisions settled during the build

- The sidebar owns depth 0 of the tree (root projects); the column stack
  never re-renders that list — see bug #2 above.
- `useRunCommand` and `DetailPane` take an explicit `parentId` rather than
  inferring it from the mutation response, since `NodeDetail`/`ColumnRow`
  don't carry `parentId` and the caller always already knows it.
- Frontend tests mark jsdom per-file via a `// @vitest-environment jsdom`
  docblock (`environmentMatchGlobs` did not reliably match `web/**` in this
  Vitest version); MSW's setup is imported explicitly per test file rather
  than globally, since it patches global `fetch`/`http` process-wide and
  broke `supertest`'s real requests in backend tests when tried as a global
  `setupFiles` entry.

Arrow-key navigation (↑↓ within a row list, ←→ between columns, spec §5.3)
was initially left out of the Column/ColumnStack task despite being in both
the plan and the spec's keyboard map — caught while writing this log entry,
before calling the phase done, rather than by a test or external review.
Implemented afterward: ↑↓ scoped to the nearest enclosing `<ul>` (so a
heading's expanded children form their own self-contained list), ←→ via
the nearest `[data-depth]` ancestor's sibling.

### Test counts

201 tests, 31 files, all passing. `npm run typecheck` (both the backend's
and `web/`'s tsconfig) clean.

### Residual risk / known gaps carried into later phases

- No automated E2E test suite exists for the golden path — Task 12's
  verification was a one-off manual script, not a checked-in test. Spec §8
  specifically calls for Playwright-driven, keyboard-sensor-based E2E
  testing starting with drag-and-drop in Phase 3; worth establishing the
  checked-in E2E harness then, covering Phase 2's flows retroactively.
- Heading expand/collapse renders nested children via the same row-list
  logic recursively, but only ever tested with todo children (matching
  Phase 1's conservative fixture generator) — a heading containing a
  sub-project is allowed by the command layer but not exercised by any
  Phase 2 test.
- Column widths default to 280px with no persistence-format migration
  story; fine for a single-user local app with no stored data yet, but
  worth a look if the `localStorage` shape ever needs to change.

## Phase 3 — Drag and Drop

**Status: complete.** Full design rationale in
`docs/superpowers/specs/2026-08-18-phase3-drag-and-drop-design.md`; plan in
`docs/superpowers/plans/2026-08-18-phase3-drag-and-drop.md`.

### What shipped

- **`commands/Rebalance.ts`**: renumbers a parent's children evenly via
  `evenlySpacedKeys()` (wrapping `fractional-indexing`'s
  `generateNKeysBetween`). Unlike `EmptyTrash`, it's fully invertible — its
  own inverse (`SetSortKeys`) swaps between the captured prior and new
  `(id, sortKey, updatedAt)` sets. `repo.updateSortKey()` added alongside
  (updates only `sort_key`/`updated_at`, distinct from
  `updateParentAndSortKey`, which `MoveNode` needs).
- **`MoveNode` exposed over HTTP**, joining the other seven commands.
  `POST /api/commands` auto-triggers `Rebalance` as a separate
  `executeCommand` call (its own transaction/`command_log` entry) whenever
  a `CreateNode`/`MoveNode`'s affected parent ends up with a sibling
  `sort_key` longer than 50 characters (spec §6.1's mitigation) —
  deliberately decoupled from the triggering command's own invert().
- **`@dnd-kit/core` + `@dnd-kit/sortable`**: `DragProvider` (one shared
  `DndContext` wrapping `Sidebar` + `ColumnStack`, so dragging onto a
  sidebar smart list is possible), a dedicated drag-handle per row
  (separate from the row itself — dnd-kit's default activation keys
  Space/Enter would otherwise collide with the app's own Space-to-complete
  and Enter-to-rename), a whole-row `useDroppable` on project rows for
  "reparent into," and a custom `collisionDetection` that prioritizes the
  whole-row target whenever the pointer is literally within it
  (`pointerWithin`), falling back to the sortable list's own
  `closestCenter` insertion-line detection otherwise.
- **`web/src/dnd/resolveMove.ts` + `sidebarActions.ts`**: the actual
  drag-resolution logic (same-column reorder, cross-column insertion,
  whole-row append, sidebar action dispatch) lives in pure,
  framework-free functions, unit-tested directly with fabricated
  ids/rects/rows — no DOM needed. `ColumnStack`/`DragProvider` are thin
  glue calling these and firing the resulting `MoveNode`/`SetWhen`/
  `TrashNode` mutation.
- Sidebar: `Today` and `Trash` are dedicated droppable `<li>`s; `Inbox`
  reuses its existing row in the root-projects list (a real `is_system`
  project), registering the drop id only on that one row; `Logbook`
  registers no droppable at all (spec §6: "not a drop target").

### Bugs and gaps the tests — and the real browser — actually caught

1. **`ColumnRow` never included `sortKey` at all**, meaning
   `useKeyboardShortcuts`' Cmd+N "insert after last sibling" logic had been
   silently broken since Phase 2 — it read a field the real API response
   never had; only test doubles that happened to include it masked this.
   Found while designing the drag-reorder logic (which also needs
   `sortKey`), not by any existing test. Fixed by adding `sortKey` to
   `ColumnRow`/`getColumn`, correcting Cmd+N's positioning retroactively.
2. **dnd-kit's `KeyboardSensor` cannot be meaningfully exercised in
   jsdom.** It resolves "next item" by comparing element rects, and jsdom
   reports every element as a zero-size rect at the same position — so
   RTL-driven pick-up/move/drop sequences never actually moved between
   items, and separately crashed on a missing `scrollIntoView` (which
   jsdom doesn't implement and dnd-kit calls unconditionally on
   activation). Spec §8 says to test "under Playwright" specifically for
   this reason — a detail this phase's design initially missed, assuming
   RTL could stand in. Corrected by extracting all drag-resolution math
   into pure functions (directly unit-tested) and moving the actual
   keyboard/pointer interaction to the real-browser pass; added the
   `scrollIntoView` polyfill regardless, since it's needed any time the
   sensor activates in jsdom at all (e.g. for existence/wiring checks).
3. **Real sort-key computation bug caught before it shipped**: the first
   draft of the same-column reorder logic used `sortKeyAfter(prevKey)`
   whenever `prevKey` was non-null, regardless of whether a `nextKey` also
   existed — meaning a middle-of-the-list drop could generate a key with
   no upper bound, risking collision with or exceeding the following
   sibling. Caught by re-reading the logic against its own unit tests
   before running them, not by a failing test — fixed to use
   `sortKeyBetween(prevKey, nextKey)` whenever a `nextKey` exists.
4. **The real-browser verification script itself had two bugs**, both
   worth noting since they could as easily have been mistaken for app
   bugs: a hardcoded test fixture sort key collided with where a prior
   drag had moved a row to (fixed by using a key that couldn't plausibly
   collide), and a premature read of a newly-opened column's contents
   raced its query response (fixed by waiting for actual row content, not
   just the column container). Both were caught by checking the server's
   own data directly via `curl` before concluding the app was wrong.

None of items 1–3 were caught by manual inspection — 1 and 3 by design-time
review, 2 by empirically running the tests and reading the actual failure.
Item 4 is a reminder that the verification script itself needs the same
skepticism as the code it's checking.

### Real-browser verification

Standalone Playwright script (same approach as Phase 2 — the bundled MCP
tool requires a `chrome`-channel binary unavailable on this host's Linux
ARM64; used the `playwright` npm package's own bundled Chromium instead,
installed temporarily via `npm install --no-save`, removed after) drove,
via actual pointer events against the real dev server: reordering two
todos within a column (confirmed persisted after reload), dragging a todo
onto a project row to reparent it (confirmed via both the UI and a direct
API query), and dragging a todo onto the sidebar's Trash entry (confirmed
removed from view). All three passed.

### Test counts

239 tests, 34 files, all passing. `npm run typecheck` clean.

### Residual risk / known gaps carried into later phases

- No checked-in automated E2E suite still — same gap noted at the end of
  Phase 2, now also covering drag-and-drop. The real-browser verification
  for both phases has been a manual one-off script each time. Worth
  building a proper Playwright test harness before Phase 4 adds more
  surface area (search, smart lists) to verify.
- The whole-row vs. insertion-line disambiguation was verified for the
  common cases (drop squarely on a row's center vs. between two rows) but
  not stress-tested at the exact boundary between the two hit zones, or
  with edge autoscroll during a drag that needs to reach an off-screen
  column — spec §6.1 flags both as real risks this phase doesn't fully
  close out.
- Rebalance's 50-character threshold and the "check after every
  `CreateNode`/`MoveNode`" trigger are unexercised by the real-browser
  pass (no test dragged the same item repeatedly to the same position
  enough times to trigger it) — covered only at the unit/command level.
