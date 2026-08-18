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
  select(depth: number, entry: OpenPathEntry): void;
  setColumnWidth(index: number, width: number): void;
  toggleShowCompleted(parentId: string): void;
  setActiveSelection(selection: ActiveSelection): void;
  setFocusedColumnParentId(parentId: string): void;
  setActiveSmartList(list: SmartList | null): void;
  setSearchOpen(open: boolean): void;
  setHeadingExpanded(headingId: string, expanded: boolean): void;
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
    }),
    { name: "tend-ui" },
  ),
);
