# Phase 5 — Undo/Redo Wiring Design

Authoritative product/behavior spec: `docs/spec.md` (§7.3 Commands, §7.4 Two
logs, §9 Build phases). This document covers only what that spec leaves
open. Do not redesign anything `docs/spec.md` settles — notably, it already
settles that the undo stack lives in server memory and dies on restart
(§7.4), and that every command already has an inverse (§7.3).

## Scope

- A server-memory undo/redo stack, pushed to after every successful
  command execution, popped by two new endpoints.
- `⌘Z` / `⌘⇧Z` wired into the existing global keyboard-shortcut listener.
- One targeted fix to `DetailPane` (below) that undo's new "state can
  change out from under an open pane" possibility exposes.

## Resolved ambiguities

**Rebalance and undo granularity.** `CreateNode`/`MoveNode` can auto-trigger
a `Rebalance` as a second, independent `executeCommand` call (spec §6.1,
built in Phase 3). Resolved with the user: every executed command — including
an auto-triggered `Rebalance` — gets its own undo-stack entry. No bundling
concept is introduced. In the rare case a rebalance actually fires, undoing
the visible user action costs two `⌘Z`'s (first the rebalance, then the
original create/move) rather than one. This matches spec §9's framing of
this phase as "nearly free" — a bundling/grouping abstraction would not be.

**Irreversible commands and stack validity.** `EmptyTrash` and `PurgeNode`
already throw `NotInvertibleError` from `invert()`. Resolved with the user:
when either runs, both the undo and redo stacks are cleared entirely, rather
than merely skipping that one entry. Rationale: an earlier undo-stack entry
(e.g. a `TrashNode` on some now-purged node) could reference a node that no
longer exists once a purge has run; clearing avoids ever attempting to
invert against missing data, at the cost of losing history that predates
the purge. Given purges are rare, deliberate, and already confirmed in the
UI, this is judged an acceptable trade.

**Visible affordance.** Resolved with the user: keyboard-only, no toast or
indicator of what was undone/redone. The app has no toast/notification
system today; building one solely for this feature would be scope creep
beyond "wiring."

## Backend

- **`server/undoStack.ts`**: `createUndoStack()` returns
  `{ push(command), undo(ctx, commandLog), redo(ctx, commandLog) }`.
  - `push(command)`: calls `command.invert()`. If it throws
    `NotInvertibleError`, both internal stacks are cleared and the command is
    not pushed. Otherwise the command is pushed onto the undo stack and the
    redo stack is cleared (a fresh action always invalidates prior redo
    history — standard undo-stack semantics).
  - `undo(ctx, commandLog)`: pops the last command from the undo stack:
    returns `false` if empty. Otherwise calls `.invert()` on it, applies the
    result via `executeCommand(inverse, ctx, commandLog)`, pushes the
    *original* command onto the redo stack, and returns `true`.
  - `redo(ctx, commandLog)`: pops the last command from the redo stack:
    returns `false` if empty. Otherwise re-applies that *same original
    command instance* via `executeCommand(command, ctx, commandLog)` again,
    pushes it back onto the undo stack, and returns `true`. This relies on
    every command's `apply()` reading current repo state fresh rather than
    caching state from construction — already true of every existing
    command, and exercised implicitly by the property test's own
    apply-then-invert cycles.
  - No size cap. This is in-memory, per-process, dies on restart per spec
    §7.4; unbounded growth within a single local-app session is not a
    realistic concern.
- **Instantiation**: one `createUndoStack()` call inside `createApp()`,
  closed over by the new routes and the existing `/api/commands` handler.
  Not a module-level singleton — each `createApp()` call (as in every
  existing test) gets an independent stack, so tests never leak undo state
  across app instances.
- **`POST /api/commands`** (existing route, modified): calls
  `undoStack.push(command)` after the primary command's `executeCommand`
  call succeeds, and again after the auto-triggered `Rebalance`'s
  `executeCommand` call, if one fires. Both pushes go through the same
  `push()` path — no special-casing by command name anywhere.
- **New routes**: `POST /api/undo`, `POST /api/redo`. Each calls the
  corresponding stack method and responds `{ ok: boolean }` — `false` means
  "there was nothing to undo/redo" (empty stack, or a preceding irreversible
  command already cleared it). Wrapped in the same try/catch-then-400
  pattern as `/api/commands`, in case an inverse's `apply()` fails against
  state that changed through some other path since it was pushed (e.g. a
  node independently hard-deleted). On such a failure the popped entry is
  simply dropped, not retried or restored — it was already stale.

## Frontend

- **`useKeyboardShortcuts.ts`**: `⌘Z` and `⌘⇧Z` added to the existing global
  `keydown` listener, alongside Space/`⌘⌫`/`⌘N`/`⌘K`. Both are **ignored
  when `document.activeElement` is an `<input>` or `<textarea>`**, so the
  browser's native per-field text undo still works while renaming a node or
  editing notes/dates. This is the one shortcut in the app that collides
  with a universal browser behavior; no other existing shortcut does, so
  none of them carry this guard, and this one specifically needs it.
- **`queries/hooks.ts`**: new `useUndo()` / `useRedo()` mutation hooks,
  calling `POST /api/undo` / `/api/redo` via new `client.ts` functions. Both
  reuse the exact cache-invalidation `useRunCommand` already performs on
  success (every open-path column, plus today/logbook/trash) — pulled into
  one shared `invalidateAfterMutation(queryClient)` helper so the list of
  invalidated query keys exists in one place, not three.
- **`DetailPane` fix**: also invalidate `["node", nodeId]` for the
  currently-open node (if the last open-path entry is a todo) as part of
  that same shared invalidation helper. `DetailPane` gains a
  `useEffect(() => setNotes(null), [node?.notes])` so its local `notes`
  override resets whenever the underlying query value actually changes
  underneath it. Today this only happens after undo/redo; a normal
  `SetNotes` save never invalidates its own node query, so this doesn't
  change behavior for ordinary editing, only forecloses a specific new bug:
  without it, undoing a notes edit while that node's detail pane is open
  would keep displaying the un-reverted text.

## Disclosed, not fixed

- `DetailPane`'s `When`/`Deadline` inputs are uncontrolled (`defaultValue`)
  and won't visually refresh if an undo touches that same node's dates
  while its pane is open, without a remount. Same class of staleness as the
  notes bug above, but a narrower window (requires the field to have never
  been touched by the user in the current mount) and a costlier fix
  (converting to controlled inputs). Carried forward as a known gap rather
  than fixed this phase.
- The pre-existing, unrelated risk that trashing/purging the node currently
  shown in `DetailPane` (already possible via `⌘⌫` or a drag-to-trash since
  Phase 2/3) leaves a detail pane open on a since-deleted node is not new to
  this phase and is not addressed here.

## Testing

- `test/server/undoStack.test.ts`: the stack in isolation — push/undo
  restores prior state, undo/redo round-trips back to the post-command
  state, undo/redo on an empty stack returns `false`, pushing an
  irreversible command clears both stacks.
- `test/server/app.test.ts` additions: full HTTP round-trip for
  `POST /api/undo` / `/api/redo`, including the two-entry rebalance case and
  the irreversible-clears-the-stack case end-to-end.
- `useKeyboardShortcuts.test.tsx` additions: `⌘Z` posts to `/api/undo`,
  `⌘⇧Z` posts to `/api/redo`; both are suppressed when focus is on an
  `<input>`/`<textarea>`.
- `DetailPane.test.tsx` addition: local `notes` override resets when the
  underlying query value changes.
- Real-browser pass (same standalone-script approach as Phases 2–4): a few
  edits, `⌘Z`, `⌘⇧Z`, confirm the column view (and, for a notes edit, the
  open detail pane) reflects the reverted/reapplied state; confirm
  `EmptyTrash` leaves nothing for a subsequent `⌘Z` to do.

## Out of scope for Phase 5 (explicitly deferred)

- Any visible undo/redo affordance beyond the keyboard shortcuts (toasts,
  menu items, a history list) — resolved above as out of scope.
- Fixing the `When`/`Deadline` staleness gap or the pre-existing
  detail-pane-on-deleted-node risk — both disclosed above, neither fixed.
- Multi-client/multi-tab undo consistency — this is a single-user local app,
  same assumption every prior phase has made.
