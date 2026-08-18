import { ColumnStack } from "./components/ColumnStack.js";
import { DetailPane } from "./components/DetailPane.js";
import { LogbookView } from "./components/LogbookView.js";
import { Sidebar } from "./components/Sidebar.js";
import { TodayView } from "./components/TodayView.js";
import { TrashView } from "./components/TrashView.js";
import { DragProvider } from "./dnd/DragProvider.js";
import { useKeyboardShortcuts } from "./keyboard/useKeyboardShortcuts.js";
import { useUiStore } from "./store/uiStore.js";

export function App() {
  useKeyboardShortcuts();
  const openPath = useUiStore((s) => s.openPath);
  const activeSmartList = useUiStore((s) => s.activeSmartList);
  const lastEntry = openPath.at(-1);
  const lastProjectEntry = [...openPath].reverse().find((e) => e.type === "project");

  return (
    <DragProvider>
      <div style={{ display: "flex" }}>
        <Sidebar />
        {activeSmartList === "today" && <TodayView />}
        {activeSmartList === "logbook" && <LogbookView />}
        {activeSmartList === "trash" && <TrashView />}
        {activeSmartList === null && <ColumnStack />}
        {activeSmartList === null && lastEntry?.type === "todo" && (
          <DetailPane nodeId={lastEntry.id} parentId={lastProjectEntry?.id ?? "root"} />
        )}
      </div>
    </DragProvider>
  );
}
