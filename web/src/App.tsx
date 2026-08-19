import { ColumnStack } from "./components/ColumnStack.js";
import { DetailPaneHost } from "./components/DetailPaneHost.js";
import { LogbookView } from "./components/LogbookView.js";
import { SearchPalette } from "./components/SearchPalette.js";
import { Sidebar } from "./components/Sidebar.js";
import { TodayView } from "./components/TodayView.js";
import { TrashView } from "./components/TrashView.js";
import { DragProvider } from "./dnd/DragProvider.js";
import { useKeyboardShortcuts } from "./keyboard/useKeyboardShortcuts.js";
import { useUiStore } from "./store/uiStore.js";

export function App() {
  useKeyboardShortcuts();
  const activeSmartList = useUiStore((s) => s.activeSmartList);

  return (
    <DragProvider>
      <SearchPalette />
      <div className="app-shell">
        <Sidebar />
        {activeSmartList === "today" && <TodayView />}
        {activeSmartList === "logbook" && <LogbookView />}
        {activeSmartList === "trash" && <TrashView />}
        {activeSmartList === null && <ColumnStack />}
        {activeSmartList === null && <DetailPaneHost />}
      </div>
    </DragProvider>
  );
}
