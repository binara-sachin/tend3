# Phase 2 — Column Stack Design

Authoritative product/behavior spec: `docs/spec.md` (§4 Views, §5 UI specification,
§7 Architecture, §9 Build phases). This document covers only what that spec
leaves open: the Phase 2 scaffold, API surface, data flow, and testing
approach. Do not redesign anything `docs/spec.md` settles.

## Scope decision

Spec §9 labels Phase 2 "static reads only," but the same bullet list includes
inline rename and keyboard navigation (Enter to rename, Space to toggle
completion, ⌘N/⌘⇧N to create, ⌘⌫ to trash). Resolved with the user: "static"
contrasts with Phase 3's drag-and-drop (dynamic pointer-driven reordering),
not with keyboard-driven mutations. Phase 2 therefore builds a full
read+write HTTP API; only pointer-based dragging waits for Phase 3. ⌘K
(search) and ⌘Z/⌘⇧Z (undo/redo) are out of scope per spec §9 (Phases 4 and 5).

## Architecture

A single Express server (spec §7.1: "a single Node or Bun process") exposes
a small JSON API and serves the built frontend as static files in
production. In dev, Vite's dev server runs alongside it and proxies `/api/*`
to Express.

Frontend: Vite + React + TypeScript. TanStack Query for server state.
A small Zustand store for pure UI state (open column path, per-column-index
widths, per-column show-completed toggles, current selection) — spec §7.6
explicitly separates this from the server-state store.

## New layers

- **`queries/getColumn.ts`** — children of a parent (or root-level projects
  when the parent is `null`), ordered by `sort_key`. The one read query
  Phase 2 needs beyond the existing `verifyCounts`.
- **`server/`** — Express app wiring `queries/` and `commands/` to HTTP.
  - `GET /api/columns/:parentId` — a column's rows. `parentId` may be the
    literal string `root` for the root-level project list.
  - `GET /api/nodes/:id` — single node detail, for the todo detail pane
    (notes, `when`, `deadline`).
  - `POST /api/commands` — body `{ type, payload }`. Dispatches to the
    matching command class (`CreateNode`, `RenameNode`, `SetNotes`,
    `SetWhen`, `SetDeadline`, `SetCompleted`, `TrashNode`; `MoveNode`,
    `RestoreNode`, `EmptyTrash`, `HardDeleteNode` are not exposed yet —
    reparenting is Phase 3, restore/purge are Phase 4's Trash view), runs it
    through `executeCommand`, returns the mutated node(s).
    One generic endpoint rather than a REST verb per command: it mirrors the
    command-object architecture directly, and no new route is needed as
    later phases add commands. This is a single-user localhost app, so
    staying in sync with the domain model outweighs REST purism here.
  - Command validation errors (thrown from `apply()`) → `400 { error }`.
    Missing node on a read → `404`.
- **`web/`** — the React app.
  - Sidebar: Inbox + root-level projects, read via the same generic column
    query. Today/Logbook/Trash render as inert placeholders — they need
    bespoke cross-cutting queries that are explicitly Phase 4 scope (spec
    §9), not a sidebar-chrome concern to redo later.
  - Column stack: selecting a project truncates columns to its right and
    opens a new one; selecting a todo truncates and opens a detail pane
    (notes editor, `when`, `deadline`); selecting a heading expands/collapses
    inline (spec §5.1).
  - Detail pane, inline rename (Enter), keyboard navigation (←→ between
    columns, ↑↓ within a column, Space to toggle completion, ⌘N/⌘⇧N to
    create, ⌘⌫ to trash) — spec §5.3's Phase-2-relevant subset.
  - Column widths: drag-adjustable, persisted per column *index* (spec
    §5.1), not per project.

## Persistence for UI state

Column widths and the open column path live in `localStorage`, not the
database. Spec §7.6 explicitly keeps the UI-state store separate from server
state, and multi-device sync is out of scope regardless (spec §10).
"Persists across restarts" reads as browser-session durability, not
cross-device sync.

## Data flow

1. Selecting a project truncates the open path (in the Zustand store) and
   TanStack Query fetches `['columns', id]`.
2. Every mutation goes through `POST /api/commands`. No optimistic updates
   (spec §7.5) — the client waits for the response, then invalidates:
   - `['columns', mutatedNode.parentId]` (the mutated node's own siblings), and
   - `['columns', pid]` for every project id currently in the open path
     (covers a completed todo's progress ring changing in an ancestor
     column that's currently visible).
   This is bounded (at most as many entries as open columns) and needs no
   server-side cooperation to compute the ancestor set.
3. Selecting a todo fetches `['node', id]` via `GET /api/nodes/:id` for the
   detail pane.

## Testing

- **Server**: integration tests against a real Express app + in-memory
  SQLite (no mocking of the command/query layers), test-first.
- **Frontend**: Vitest + React Testing Library against a mocked API layer,
  test-first.
- **Before declaring done**: start the real dev server and drive it with
  Playwright to confirm the golden path — open a project, navigate columns,
  rename inline, toggle completion, create a todo, trash a node — actually
  works end-to-end, not just green at the unit level.

## Out of scope for Phase 2 (explicitly deferred)

- Drag and drop (Phase 3).
- `MoveNode` exposure over HTTP (Phase 3 — reparenting is drag-and-drop's job).
- Today/Logbook/Trash query implementations and FTS5 search (Phase 4).
- Undo/redo (Phase 5).
