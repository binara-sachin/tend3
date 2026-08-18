# Phase 3 — Drag and Drop Design

Authoritative product/behavior spec: `docs/spec.md` (§6 Drag and drop, §7
Architecture, §8 Testing, §9 Build phases). This document covers only what
that spec leaves open. Do not redesign anything `docs/spec.md` settles.

## Scope

Single-item drag only (spec §6). Two drop-target kinds:
1. **Insertion line between siblings** — reorder within the current parent,
   or reparent-and-position when crossing columns.
2. **Whole-row target on a project** — reparent into that project, appended
   at the end.

Sidebar smart lists are action targets, not move targets: Today sets
`when_date`, Trash sets `deleted_at`, Inbox reparents there; Logbook is not
a drop target. Today/Logbook/Trash stay non-clickable placeholders for
navigation purposes — their real filtered views are Phase 4's job; spec §9
explicitly wants drag-and-drop "not entangled with smart-list filtering
while being debugged."

## Deviation from spec, disclosed and approved

Spec §9 suggests spiking drag-and-drop standalone against fixture data
before wiring the real tree. Built directly against the real
`Column`/`ColumnStack` instead, since they're already small and well-tested
and dnd-kit's keyboard sensor gives the same fast, deterministic feedback a
spike would. Approved by the user during design review.

## Architecture

`@dnd-kit/core` + `@dnd-kit/sortable`. One shared `DndContext` at the
`ColumnStack` level (cross-column drag requires a single context spanning
all currently-open columns). One `SortableContext` per column, using
dnd-kit's standard multiple-containers pattern.

Each row is a sortable item via `useSortable`. Project rows *additionally*
register a `useDroppable` "whole-row" zone layered over the row, so
collision detection can distinguish "dropped near a row's edge" (insert as
sibling, via the sortable's own reordering) from "dropped on the row's
middle" (reparent into that project, via the whole-row droppable winning
collision priority when the pointer is within its central band). This
disambiguation is the single riskiest piece per spec §6.1's own callout —
budget review time for it specifically.

Sidebar's Today/Inbox entries are `useDroppable` zones wired to
`SetWhen`/`MoveNode` on drop; Trash is a `useDroppable` zone wired to
`TrashNode`. None of the three are click targets (unchanged from Phase 2).

## Server changes

- Expose `MoveNode` over `POST /api/commands` (withheld in Phase 2
  specifically so reparenting stayed drag-and-drop's job — see the Phase 2
  design doc's "out of scope" section).
- `repo.rebalance(parentId)`: renumbers a parent's children evenly with
  fresh fractional-index keys, preserving order. Called after any
  `MoveNode`/`CreateNode` insertion when any sibling's `sort_key` in that
  parent exceeds 50 characters (arbitrary, documented threshold) — spec
  §6.1's explicit mitigation for repeated-insert-at-the-same-position key
  growth, deliberately deferred from Phase 1 since nothing could trigger it
  before drag-and-drop existed.

## Client changes

- `MoveNode` payload dispatch added to `web/src/api` / the keyboard-shortcut
  style command-dispatch usage already established (client sends
  `{ nodeId, newParentId, newSortKey }`).
- Drop handling computes `newSortKey` via the existing `lib/sortKey.ts`
  (`sortKeyBetween`/`sortKeyAfter`/`firstSortKey`, already reused from the
  backend in Phase 2's keyboard-shortcuts hook) based on where the
  insertion line lands, or `sortKeyAfter(lastChild)` for whole-row (append)
  drops.
- Sidebar's Today drop target computes "today" client-side
  (`new Date()` truncated to a calendar date) — a user-facing date
  convenience feeding the same `SetWhen` a manual date-pick would, not an
  audit-relevant event timestamp like `TrashNode`/`SetCompleted`'s, so
  client-computed is acceptable for a single local user with a correct
  system clock.

## Testing

Spec §8: "End-to-end drag-and-drop via dnd-kit's keyboard sensor, not
simulated pointer events." dnd-kit's `KeyboardSensor` responds to real
keyboard events (Space to pick up, arrow keys to move between droppable
targets, Space to drop), so RTL + `userEvent.keyboard` can drive it
directly in jsdom — no browser required for the automated suite, and it's
deterministic in exactly the way spec calls for.

One real-browser Playwright pass at the end (same approach as Phase 2's
standalone script, given the MCP tool's `chrome`-channel constraint on this
host), for what keyboard-sensor tests structurally can't see: actual
pointer-drag visuals and edge autoscroll behavior.

## Out of scope for Phase 3 (explicitly deferred)

- Today/Logbook/Trash's actual filtered list views and FTS5 search (Phase 4).
- Undo/redo (Phase 5) — drag operations go through `MoveNode` like any
  other command, so undo support is free once Phase 5 wires the stack.
