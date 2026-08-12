# Project: Column-View Todo App

Full design: `docs/spec.md` — authoritative. Read it before non-trivial work.
Progress log: `docs/progress.md` — append after each phase.

## Architectural rules (non-negotiable)

1. No SQL outside `repo/`. The `NodeRepository` interface is the seam for the
   future Postgres migration; it only holds if nothing bypasses it.
2. No database write outside `commands/`. A single direct write silently breaks
   both undo and the command log.
3. Every command has `apply()` and `invert()`. No exceptions.
4. Every command updates `open_descendant_count` for affected ancestors in the
   same transaction.
5. Dates are calendar dates, no time component, no timezone handling.
6. Node ids are UUIDv7, generated in application code, never by the database.

## Invariants enforced in the command layer

- `todo` has no children.
- `heading`'s parent must be a `project`; headings never nest.
- Root nodes are always `project`.
- No node may move into its own descendant (validated server-side).
- `completed_at` set only on `todo`; projects derive completion.
- Every non-root node has exactly one parent — no orphan state.
- A project is complete iff `open_descendant_count = 0` AND it has at least one
  live descendant. The second clause is load-bearing: without it, empty projects
  are vacuously complete.

## Build phases

1. Core: schema, migrations, repo, commands, command log, invertibility test
2. Column stack UI (static reads)
3. Drag and drop
4. Smart lists + FTS5 search
5. Undo/redo wiring

Work one phase at a time. Do not start the next phase without explicit approval.

## Definition of done for any task

Tests written, tests run, output shown. No completion claims without evidence.
