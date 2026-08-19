import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface OpenPathEntry {
  id: string;
  type: "project" | "todo";
}

export interface ActiveSelection {
  parentId: string;
  nodeId: string;
  type: "project" | "heading" | "todo";
}

export type SmartList = "today" | "logbook" | "trash";

export interface UiState {
  openPath: OpenPathEntry[];
  columnWidths: Record<number, number>;
  showCompleted: Record<string, boolean>;
  activeSelection: ActiveSelection | null;
  /** Which column currently has focus, independent of any row being selected within it — Cmd+N needs a target parent even in an empty column. */
  focusedColumnParentId: string | null;
  /** Which sidebar smart list (if any) is showing instead of the column stack. */
  activeSmartList: SmartList | null;
  /** Whether the ⌘K search palette is open. */
  isSearchOpen: boolean;
  /** Which headings are currently expanded inline within their column — global (not per-column) since a heading has exactly one parent column. */
  expandedHeadings: Record<string, boolean>;
  /**
   * The parentId (UI "root"/id sentinel) currently showing a blank inline
   * title input for a not-yet-created node, or null. Only one at a time —
   * setting a new value abandons whatever was being typed elsewhere.
   */
  creatingParentId: string | null;
  /**
   * The node type that pending input will create, when it's anything other
   * than the default inferred from creatingParentId (a project at root,
   * a todo everywhere else) — e.g. explicitly creating a sub-project inside
   * an open project. Null whenever creatingParentId is, or whenever the
   * default inference is what's wanted.
   */
  creatingType: "project" | "todo" | null;
  select(depth: number, entry: OpenPathEntry): void;
  setColumnWidth(index: number, width: number): void;
  toggleShowCompleted(parentId: string): void;
  setActiveSelection(selection: ActiveSelection): void;
  setFocusedColumnParentId(parentId: string): void;
  setActiveSmartList(list: SmartList | null): void;
  setSearchOpen(open: boolean): void;
  setHeadingExpanded(headingId: string, expanded: boolean): void;
  setCreatingParentId(parentId: string | null, type?: "project" | "todo"): void;
  /** Deselects the currently open todo (its detail pane), leaving the column stack it was opened from untouched. A no-op if the current selection isn't a todo. */
  deselectTodo(): void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      openPath: [],
      columnWidths: {},
      showCompleted: {},
      activeSelection: null,
      focusedColumnParentId: null,
      activeSmartList: null,
      isSearchOpen: false,
      expandedHeadings: {},
      creatingParentId: null,
      creatingType: null,

      select(depth, entry) {
        set({ openPath: [...get().openPath.slice(0, depth), entry], activeSmartList: null });
      },

      setColumnWidth(index, width) {
        set({ columnWidths: { ...get().columnWidths, [index]: width } });
      },

      toggleShowCompleted(parentId) {
        const current = get().showCompleted;
        set({ showCompleted: { ...current, [parentId]: !current[parentId] } });
      },

      setActiveSelection(selection) {
        set({ activeSelection: selection });
      },

      setFocusedColumnParentId(parentId) {
        set({ focusedColumnParentId: parentId });
      },

      setActiveSmartList(list) {
        set({ activeSmartList: list });
      },

      setSearchOpen(open) {
        set({ isSearchOpen: open });
      },

      setHeadingExpanded(headingId, expanded) {
        set({ expandedHeadings: { ...get().expandedHeadings, [headingId]: expanded } });
      },

      setCreatingParentId(parentId, type) {
        set({ creatingParentId: parentId, creatingType: parentId === null ? null : (type ?? null) });
      },

      deselectTodo() {
        const path = get().openPath;
        if (path.at(-1)?.type !== "todo") return;
        set({ openPath: path.slice(0, -1), activeSelection: null });
      },
    }),
    { name: "tend-ui" },
  ),
);
