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
