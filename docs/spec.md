# Column-View Todo App — Design Spec

A local-first todo application whose primary navigation is a macOS Finder–style column view, backed by SQLite, architected so that migrating to a cloud-hosted database later is a deployment change rather than a rewrite.

This document is the output of a design session. Decisions are recorded with the alternatives that were rejected and why, so that neither the implementer nor future-you re-litigates them by accident.

---

## 1. Product summary

Everything the user creates lives in **one recursive tree** stored in SQLite. The tree is navigated exactly like Finder's column view: selecting a container in column *N* truncates every column to its right and opens column *N+1*.

A fixed sidebar sits to the left of the column stack, showing four smart lists (Inbox, Today, Logbook, Trash) and the root-level projects.

There is no separate "area" concept. **An area is simply a root-level project.** The sidebar renders depth 0 of the same tree that the columns render at every other depth.

---

## 2. Non-goals for v1

These were considered and deliberately excluded. They are omissions by decision, not oversight.

| Excluded | Reason |
|---|---|
| Repeating / recurring tasks | RRULE parsing, instance materialisation, and completion-of-an-instance semantics roughly double the date subsystem |
| Multi-select drag | Requires per-column selection state, range semantics across the tree, and batch cycle validation |
| Manual ordering within Today | Introduces a second ordering domain that must be maintained on every insert, removal, completion, and date change |
| A `canceled` lifecycle state | A third state that every query, filter, and count must account for forever |
| Tags / labels | Orthogonal to the tree; adds a many-to-many dimension with its own filtering UI |
| Mobile and tablet layouts | Unreachable over localhost until the cloud migration exists |
| Global quick-capture hotkey | Impossible from a browser tab; requires a native wrapper |
| Multi-device sync | Distinct problem from the storage swap — see §10 |
| Standalone text/note nodes | Subsumed by a heading with an empty title and a filled `notes` field |

---

## 3. Data model

### 3.1 Schema

```sql
CREATE TABLE nodes (
  id                    TEXT PRIMARY KEY,           -- UUIDv7
  parent_id             TEXT REFERENCES nodes(id),  -- NULL only for roots
  type                  TEXT NOT NULL CHECK (type IN ('project','heading','todo')),
  title                 TEXT NOT NULL DEFAULT '',
  notes                 TEXT NOT NULL DEFAULT '',   -- markdown
  sort_key              TEXT NOT NULL,              -- fractional index, scoped to parent
  when_date             TEXT,                       -- ISO 8601 date, no time component
  deadline              TEXT,                       -- ISO 8601 date, no time component
  completed_at          TEXT,                       -- todos only
  deleted_at            TEXT,
  is_system             INTEGER NOT NULL DEFAULT 0, -- Inbox only
  open_descendant_count INTEGER NOT NULL DEFAULT 0, -- projects only; see §3.4
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  UNIQUE (parent_id, sort_key)
);

CREATE INDEX idx_nodes_parent   ON nodes(parent_id, sort_key);
CREATE INDEX idx_nodes_when     ON nodes(when_date)  WHERE when_date  IS NOT NULL;
CREATE INDEX idx_nodes_deadline ON nodes(deadline)   WHERE deadline   IS NOT NULL;
CREATE INDEX idx_nodes_done     ON nodes(completed_at) WHERE completed_at IS NOT NULL;
CREATE INDEX idx_nodes_trash    ON nodes(deleted_at)   WHERE deleted_at   IS NOT NULL;
```

**UUIDv7 for ids**, not autoincrement — time-sortable, generatable client-side, and collision-free across devices when sync arrives.

**Dates carry no time component.** `when_date` and `deadline` are calendar dates. This avoids timezone reconciliation entirely, which matters the moment the DB moves to a cloud server in a different zone.

### 3.2 Node types

| Type | Children | Expands to | Completable | Has notes | Has dates |
|---|---|---|---|---|---|
| `project` | yes | next column | derived (§3.4) | yes | yes |
| `heading` | yes | inline, within the same column | no | yes | no |
| `todo` | no | detail pane in next column | yes, manually | yes | yes |

A `project` is a folder. A `todo` is a file. A `heading` is an inline group — it owns its children through a real `parent_id`, but renders them indented within the current column rather than opening a new one.

### 3.3 Structural invariants

Enforced in the command layer; mirrored as CHECK constraints and triggers where SQLite permits.

1. A `todo` has no children.
2. A `heading`'s parent must be a `project`. **Headings do not nest** — an inline group inside an inline group has no coherent rendering.
3. Root nodes (`parent_id IS NULL`) are always `project`.
4. A node may not be moved into its own descendant. Validated server-side on every move; validated client-side too, but only as a drag affordance, never as the guarantee.
5. `completed_at` is set only on `todo`. Projects derive completion; headings are never completable.
6. Every non-root node has exactly one parent. There is no orphan state.

### 3.4 Derived project completion

A project has **no checkbox**. It shows a progress ring and completes automatically when all its descendants are complete; unchecking a descendant reopens it.

Recomputing this per render is a recursive walk per project, so each project denormalises `open_descendant_count`, maintained in the same transaction as any command that mutates its subtree.

```
project is complete  ⇔  open_descendant_count = 0
                     AND it has at least one live (non-deleted) descendant
```

**The second clause is load-bearing.** Without it, a newly created empty project is vacuously complete and drops straight into the Logbook.

> **Risk.** This is a denormalisation and denormalisations drift. Ship a `verifyCounts()` routine that recomputes every count from scratch and reports mismatches, and assert it in tests after every command sequence. Without it, a project stuck at 3/4 forever gives you no way to tell whether the bug is in the count or in the tree.

**Abandoning a project**: trash it. There is no cancel action. Accepted trade-off — "I finished this, mostly" and "I deleted this by mistake" land in the same bucket.

### 3.5 Inbox

Inbox is a **real seeded node**: a root-level project with a fixed, well-known UUID and `is_system = 1`. It cannot be renamed, deleted, moved, or reparented. Todos created without a target parent go here.

Modelling it as a node rather than a `parent_id IS NULL` query preserves invariant 6, and gives Inbox ordering, drag-and-drop, and column expansion for free because it is just a project the sidebar renders specially.

### 3.6 Completion and deletion are ancestry-aware

Both are timestamps, never locations. A node never moves when completed or deleted.

Trashing a project sets `deleted_at` **on that node only**. Descendants disappear from view because an ancestor is trashed. Restoring therefore brings back exactly the subtree that existed at deletion time, and a child trashed separately beforehand correctly stays trashed.

Visibility is resolved with a recursive CTE walking to the root. At personal-todo scale this is comfortably fast, and it avoids a materialised path column that every subtree move would have to rewrite.

---

## 4. Views

### Inbox
Contents of the system Inbox node, in `sort_key` order. Behaves as an ordinary project column.

### Today
A read-only query, **rule-ordered, no manual reordering**:

```
WHERE completed_at IS NULL
  AND no ancestor is trashed AND not trashed
  AND (when_date <= today OR deadline <= today)
ORDER BY  overdue deadlines first (deadline < today),
          then deadline ascending,
          then when_date ascending,
          then parent project, then sort_key
GROUP BY parent project
```

Dropping a node onto Today in the sidebar sets `when_date = today`. It does not move the node.

### Logbook
Completed todos and derived-complete projects, grouped by completion day, most recent first. Read-only. Not a drop target.

### Trash
Nodes with `deleted_at` set whose ancestors are not themselves trashed (so a trashed subtree appears once, at its root). Ordered by `deleted_at` descending. Supports restore and permanent delete; Empty Trash purges permanently.

---

## 5. UI specification

### 5.1 Layout

A fixed sidebar, then a horizontally scrolling column stack.

- Selecting a `project` truncates all columns to its right and opens a new column.
- Selecting a `todo` truncates and opens a **detail pane** in the next column — notes editor, `when`, `deadline`. This is Finder's file preview.
- Selecting a `heading` expands or collapses it inline; it never opens a column.
- The stack auto-scrolls right to reveal a newly opened column.
- Column widths are drag-adjustable at the dividers and persist **per column index**, not per project.
- The open column path persists across restarts.
- Desktop only. A minimum window width; below it, horizontal scroll handles overflow.

### 5.2 Completed item visibility

Checking a todo hides it from its column immediately and it appears in the Logbook. Each column has a **Show completed** toggle to bring completed items back into view in place.

Rejected: letting the item linger struck-through for a couple of seconds. It looks nicer but requires timers in the view layer and creates a window where the same item is in two places.

### 5.3 Keyboard map

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

### 5.4 Search

`⌘K` opens a fuzzy search palette over titles and notes, backed by **SQLite FTS5** with triggers keeping the virtual table in sync. Selecting a result opens the full column path to that node and selects it.

> **Risk.** FTS5 triggers index everything, including trashed and completed nodes. Search queries **must** join back to `nodes` and filter both the node's own `deleted_at` and its ancestry. The failure mode is trashed items surfacing in `⌘K`.

---

## 6. Drag and drop

**Single-item drag only in v1.** Library: `dnd-kit`.

Two distinct drop-target kinds:

1. **Insertion line between siblings** → reorder within the current parent, or reparent-and-position when crossing columns.
2. **Whole-row target on a project** → reparent into that project, appended at the end.

Sidebar smart lists are **action targets, not move targets**:

| Target | Effect |
|---|---|
| Today | `when_date = today` |
| Trash | `deleted_at = now` |
| Inbox | reparent to the Inbox node |
| Logbook | not a drop target |

### 6.1 Ordering: fractional indices

Sibling order is a **string fractional index** (LexoRank/Figma style), ordered by `sort_key` scoped to `parent_id`. A reorder writes exactly one row regardless of list length, and merges sanely under eventual consistency.

Rejected: integer `position` columns. They force an N-row rewrite per drag and produce guaranteed conflicts the moment two devices reorder the same list.

> **Risk.** Repeated insertion at the same position (drag to top, drag to top, drag to top) grows keys without bound. They will not break, but they will get long. Write a `rebalance(parentId)` routine that renumbers a parent's children evenly, and call it when any key in a list exceeds a length threshold.

> **Risk — highest in the project.** Drag-and-drop across a horizontally scrolling column stack is the hardest thing here: nested sortable contexts, edge autoscroll in two axes, and disambiguating "insert between siblings" from "drop into this project" when the cursor is over a project row. Budget disproportionately. Consider spiking it standalone against fixture data before wiring it to the real tree.

---

## 7. Architecture

### 7.1 Process shape

A single Node or Bun process serves the built frontend as static files and exposes a JSON API on localhost. SQLite via `better-sqlite3` in WAL mode.

`better-sqlite3` is synchronous, which is a feature here: single user, single process, sub-millisecond queries, and no `await` interleaving inside transactions.

### 7.2 Layers

Strictly one-directional. `queries` and `commands` both depend on `repo`; nothing depends on them.

```
db/         schema + numbered SQL migrations, run at boot
repo/       NodeRepository interface + SqliteNodeRepository
commands/   every mutation, each with apply() and invert()
queries/    read models: getColumn, getToday, getLogbook, getTrash, search
```

**All SQL is confined to `repo/`.** This is the seam swapped for Postgres later, and the discipline only holds if nothing outside that directory ever writes a query.

**All writes go through `commands/`.** No exceptions — a single direct write outside the command layer silently breaks both undo and the command log.

### 7.3 Commands

Each command is an object with `apply()` and `invert()`:

| Command | Inverse |
|---|---|
| `CreateNode` | `HardDeleteNode` |
| `MoveNode` | `MoveNode` to prior parent + prior `sort_key` |
| `RenameNode` | `RenameNode` to prior title |
| `SetNotes` | `SetNotes` to prior value |
| `SetWhen` / `SetDeadline` | set to prior value |
| `SetCompleted` | clear / restore prior `completed_at` |
| `TrashNode` | `RestoreNode` |
| `RestoreNode` | `TrashNode` with prior `deleted_at` |
| `EmptyTrash` | none — irreversible, confirm in UI |

Every command updates `open_descendant_count` for affected ancestors in the same transaction.

### 7.4 Two logs — do not conflate them

**The undo stack** lives in server memory and dies on restart. `⌘Z` resurrecting an operation from three days ago is a misfeature, not continuity.

**The command log** is an append-only `command_log` table recording every applied command with timestamp and payload. It does nothing in v1 except accumulate. It is what makes sync tractable in v2 — an op log is a command stack that got persisted. Building it now costs one insert per mutation; retrofitting it means reconstructing history you no longer have.

```sql
CREATE TABLE command_log (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  command    TEXT NOT NULL,   -- command type name
  payload    TEXT NOT NULL,   -- JSON
  applied_at TEXT NOT NULL
);
```

### 7.5 No optimistic updates

The server is the single source of truth. The client issues a command, then refetches the affected columns. Round-trip on localhost is ~1ms, and this deletes an entire category of divergence bugs.

When latency becomes real after the cloud migration, optimistic application layers on naturally — the command objects already know how to apply themselves client-side.

### 7.6 Frontend

React + TypeScript. TanStack Query for server state, with per-column cache keys so a mutation invalidates only the columns it touched. A separate small store for pure UI state: open column path, column widths, selection, per-column show-completed flags.

---

## 8. Testing

**Command invertibility, as a property test.** This is the highest-value test in the project. For any command applied to a fixture database, applying its inverse must produce byte-identical state. That single property catches most of the ways a command stack goes subtly wrong.

**Count integrity.** Run `verifyCounts()` after every command sequence in tests; a mismatch fails the test.

**Query tests** against in-memory SQLite with fixtures, covering ancestry-aware visibility explicitly — trashed ancestors, separately-trashed descendants, restore ordering.

**End-to-end drag-and-drop via dnd-kit's keyboard sensor, not simulated pointer events.** DnD is notoriously flaky to test with mouse simulation. Driving it through the keyboard sensor exercises the same reordering logic deterministically and fast under Playwright.

---

## 9. Build phases

**Phase 1 — Core.** Schema, migrations, repository, command layer, command log, invertibility property test. No UI at all.

**Phase 2 — Column stack.** Rendering, navigation, truncation, adjustable and persisted widths, detail pane, inline rename, keyboard navigation. Static reads only.

**Phase 3 — Drag and drop.** The riskiest piece, isolated. It needs a real tree to drag through, but must not be entangled with smart-list filtering while being debugged.

**Phase 4 — Smart lists and search.** Inbox, Today, Logbook, Trash, FTS5 and the `⌘K` palette.

**Phase 5 — Undo/redo wiring.** Nearly free by this point; the commands already invert.

---

## 10. Deliberately unsolved

This architecture makes the **storage swap** easy: implement a `PostgresNodeRepository`, change config, deploy the same server.

It does **not** solve **multi-device sync**. Concurrent edits, tombstone reconciliation, and clock skew are a separate problem. UUIDv7 keys, fractional indices, ancestry-aware soft deletes, and the persisted command log are the groundwork that keeps sync tractable later — they are not a solution to it, and should not be mistaken for one.
