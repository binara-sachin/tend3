# Tend

A local-first todo app whose primary navigation is a macOS Finder–style
column view. Everything you create — projects, headings, todos — lives in
one recursive tree, stored in SQLite, and browsed by drilling into columns
the same way Finder browses folders.

Full design rationale (including rejected alternatives) lives in
[`docs/spec.md`](docs/spec.md); build history and per-phase test evidence
in [`docs/progress.md`](docs/progress.md).

## Features

- **Column-view navigation** — select a project to open the next column,
  truncating everything to its right; select a todo to open a detail pane
  (notes, when, deadline) in its place.
- **Smart lists** — Inbox, Today (rule-ordered by due/overdue date), Logbook
  (completed todos and derived-complete projects, grouped by day), and Trash.
- **Drag and drop** reordering and reparenting, keyboard-operable via
  dnd-kit's keyboard sensor.
- **⌘K fuzzy search** over titles and notes (SQLite FTS5), which opens the
  full column path to a result and expands any collapsed headings along the
  way.
- **Undo/redo** (⌘Z / ⌘⇧Z) for every mutation, backed by a command pattern
  where each command knows how to invert itself.
- A full keyboard map — see [Keyboard shortcuts](#keyboard-shortcuts) below.

## Architecture

A single Node process serves the built frontend as static files and exposes
a JSON API on localhost, backed by SQLite (`better-sqlite3`, WAL mode).
Layers are strictly one-directional:

```
db/         schema + numbered SQL migrations, run at boot
repo/       NodeRepository interface + SqliteNodeRepository (all SQL lives here)
commands/   every mutation, each with apply() and invert()
queries/    read models: getColumn, getToday, getLogbook, getTrash, search
server/     Express app, command dispatch, in-memory undo stack
web/        React + TypeScript frontend (TanStack Query + Zustand)
```

All SQL is confined to `repo/` — the seam this project is designed around
for a future Postgres migration. All writes go through `commands/`; nothing
outside that directory ever mutates the database directly, which is what
keeps undo/redo and the append-only command log correct.

## Getting started

Requires Node 20+ (developed and tested against Node 22).

```bash
npm install
npm run dev:server   # API server on http://localhost:3001
npm run dev:web      # Vite dev server on http://localhost:5173, proxying /api
```

Open http://localhost:5173. The SQLite database file (`tend.db` by default)
is created and migrated automatically on first server start.

### Production build

```bash
npm run build   # builds the frontend into dist/web
npm start        # serves the API and the built frontend from one process
```

Set `PORT` and `TEND_DB_PATH` to override the default port (3001) and
database file location.

## Testing

```bash
npm test           # unit + integration tests (Vitest)
npm run typecheck  # both tsconfigs (root + web)
npm run test:e2e   # Playwright end-to-end suite, real browser
```

The unit suite includes a command-invertibility property test (via
fast-check) — for any command applied to a random fixture tree, applying
its inverse must restore byte-identical database state. This is the
highest-value test in the project; most command-layer bugs surface here
before they reach the UI.

The Playwright suite (`e2e/`) is a permanent regression-validation harness
covering navigation, drag-and-drop, smart lists/search, and undo/redo end
to end against the real server and a disposable SQLite database. Run it
whenever making changes that touch the API, commands, or frontend
data-fetching layer.

## Keyboard shortcuts

| Key | Action |
|---|---|
| `←` `→` | Move between columns |
| `↑` `↓` | Move within a column |
| `Enter` | Rename selected node inline |
| `Space` | Toggle completion of selected todo |
| `⌘N` | New sibling below selection |
| `⌘⇧N` | New child inside selected project |
| `⌘⌫` | Trash selection |
| `⌘K` | Search palette |
| `⌘Z` / `⌘⇧Z` | Undo / redo |

## Non-goals

Deliberately out of scope for v1 (see [`docs/spec.md`](docs/spec.md#2-non-goals-for-v1)
for the reasoning behind each): recurring tasks, multi-select drag, manual
ordering within Today, a "canceled" state, tags/labels, mobile/tablet
layouts, a global quick-capture hotkey, and multi-device sync.
