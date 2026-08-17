import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface OpenPathEntry {
  id: string;
  type: "project" | "todo";
}

export interface UiState {
  openPath: OpenPathEntry[];
  columnWidths: Record<number, number>;
  showCompleted: Record<string, boolean>;
  selection: Record<string, string>;
  select(depth: number, entry: OpenPathEntry): void;
  setColumnWidth(index: number, width: number): void;
  toggleShowCompleted(parentId: string): void;
  setSelection(parentId: string, nodeId: string): void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      openPath: [],
      columnWidths: {},
      showCompleted: {},
      selection: {},

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

      setSelection(parentId, nodeId) {
        set({ selection: { ...get().selection, [parentId]: nodeId } });
      },
    }),
    { name: "tend-ui" },
  ),
);
