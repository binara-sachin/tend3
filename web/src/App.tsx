import { ColumnStack } from "./components/ColumnStack.js";
import { DetailPane } from "./components/DetailPane.js";
import { Sidebar } from "./components/Sidebar.js";
import { useKeyboardShortcuts } from "./keyboard/useKeyboardShortcuts.js";
import { useUiStore } from "./store/uiStore.js";

export function App() {
  useKeyboardShortcuts();
  const openPath = useUiStore((s) => s.openPath);
  const lastEntry = openPath.at(-1);
  const lastProjectEntry = [...openPath].reverse().find((e) => e.type === "project");

  return (
    <div style={{ display: "flex" }}>
      <Sidebar />
      <ColumnStack />
      {lastEntry?.type === "todo" && (
        <DetailPane nodeId={lastEntry.id} parentId={lastProjectEntry?.id ?? "root"} />
      )}
    </div>
  );
}
