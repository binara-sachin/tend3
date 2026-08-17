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

export interface UiState {
  openPath: OpenPathEntry[];
  columnWidths: Record<number, number>;
  showCompleted: Record<string, boolean>;
  activeSelection: ActiveSelection | null;
  select(depth: number, entry: OpenPathEntry): void;
  setColumnWidth(index: number, width: number): void;
  toggleShowCompleted(parentId: string): void;
  setActiveSelection(selection: ActiveSelection): void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      openPath: [],
      columnWidths: {},
      showCompleted: {},
      activeSelection: null,

      select(depth, entry) {
        set({ openPath: [...get().openPath.slice(0, depth), entry] });
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
    }),
    { name: "tend-ui" },
  ),
);
