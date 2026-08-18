# Phase 4 — Smart Lists and Search Design

Authoritative product/behavior spec: `docs/spec.md` (§4 Views, §5.4 Search,
§7 Architecture, §9 Build phases). This document covers only what that spec
leaves open. Do not redesign anything `docs/spec.md` settles.

## Scope

- **Inbox**: already complete since Phase 2 — it's an ordinary project
  column (a real, `is_system` node), nothing new needed.
- **Today**: read-only, rule-ordered (spec §4's exact `WHERE`/`ORDER BY`/
  `GROUP BY`), grouped by parent project. Dropping onto it (Phase 3) sets
  `when_date`; it never moves the node.
- **Logbook**: completed todos + derived-complete projects, grouped by
  completion day, most recent first. Read-only, not a drop target.
- **Trash**: trashed roots (spec §3.6/§4 — a trashed subtree appears once,
  at its root), ordered by `deleted_at` descending. Supports restore and
  per-item permanent delete, plus a separate global Empty Trash.
- **Search (`⌘K`)**: fuzzy search over titles/notes via SQLite FTS5,
  triggers keeping the index in sync. Selecting a result opens the full
  column path to it and selects it.

## Resolved ambiguity: single-item permanent delete

Spec says Trash "supports restore and permanent delete" per item, separate
from the global "Empty Trash." Phase 1 only built the global purge
(`EmptyTrash`) and a leaf-only `HardDeleteNode` restricted to serving as
`CreateNode`'s inverse — neither fits a user-facing single-item purge.

Added **`PurgeNode(nodeId)`**: recursively hard-deletes one trash root's
entire subtree via `repo.hardDeleteSubtree` (already built in Phase 1 for
`EmptyTrash`). Irreversible, same pattern as `EmptyTrash` — `invert()`
throws `NotInvertibleError`. Rejects a `nodeId` that isn't itself a trash
root (its own `deleted_at` must be set; per spec §3.6 a node whose ancestor
is trashed but which isn't itself marked deleted is not an independent
purge target — purging the root purges its whole subtree, id included).

## Backend

- **FTS5**: a new migration adds a virtual table (`nodes_fts` over `title`,
  `notes`) plus `AFTER INSERT/UPDATE/DELETE` triggers on `nodes` that keep
  it in sync. This is schema, not application code — same reasoning as
  Phase 1's "migrations aren't queries under the no-SQL-outside-repo rule."
  No command needs to change; sync is automatic and transactional with
  whatever wrote the row.
- Spec §5.4's risk (trashed/completed items leaking into `⌘K`) is handled
  entirely in the **query**, not the index: `getSearchResults` joins FTS5
  hits back to `nodes` and excludes rows whose own `deleted_at` is set or
  whose ancestry (via the existing ancestor-walk machinery) includes a
  trashed node. The index itself stays "index everything" as spec expects.
- **New queries**: `getToday.ts`, `getLogbook.ts`, `getSearchResults.ts`.
  `getTrash.ts` is a thin wrapper over the existing `repo.getTrashRoots()`.
  Each search result carries its ancestor path (`{id, type}[]`, nearest
  ancestor first) so the client can open the full column path in one
  round-trip rather than a second lookup.
- **New routes**: `GET /api/today`, `/api/logbook`, `/api/trash`,
  `/api/search?q=`. `RestoreNode` and `EmptyTrash` join the HTTP-exposed
  command set (withheld until this phase, per the Phase 2/3 design docs'
  "out of scope" sections); `PurgeNode` is newly exposed alongside them.

## Frontend

- Sidebar's Today/Logbook/Trash become real navigation targets (inert
  placeholders since Phase 2) rendering dedicated read-only view
  components — not `Column`: these are derived/grouped lists with no
  drag-drop, no inline create, no rename.
- `⌘K` opens a modal search palette: type to query `/api/search`, arrows
  to move between results, Enter to select (sets the open path from the
  result's carried ancestor path and closes the palette), Escape to close
  without selecting.
- Trash view: each row gets Restore and Permanent Delete (`PurgeNode`)
  actions; a global Empty Trash button, confirmed before firing since it's
  irreversible.

## Testing

Same pattern as prior phases: backend queries get real-SQLite integration
tests against fixture trees (Phase 1's style); the FTS5 sync gets a
dedicated test proving a trashed or completed item's title never surfaces
in results even though it's still indexed. Frontend view/palette
components get RTL + MSW tests. Nothing in this phase touches real layout
or dnd-kit, so none of Phase 3's jsdom traps are expected to recur.

## Out of scope for Phase 4 (explicitly deferred)

- Undo/redo (Phase 5) — `RestoreNode`/`EmptyTrash`/`PurgeNode` go through
  the same command/HTTP path as everything else, so undo support (where
  applicable — `EmptyTrash`/`PurgeNode` remain irreversible by design) is
  free once Phase 5 wires the stack.
