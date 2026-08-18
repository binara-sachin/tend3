import { useEffect, useRef, useState } from "react";
import { getSearchResults, type SearchResult } from "../api/client.js";
import { useUiStore, type OpenPathEntry } from "../store/uiStore.js";

const DEBOUNCE_MS = 200;

/** Opens the enclosing project column chain (root first), plus the result itself
 * when it's directly representable in the open path (project or todo — a heading
 * itself can't be, since openPath only ever holds project/todo entries; any
 * heading ancestors get expanded separately by chooseResult()). */
function buildOpenPath(result: SearchResult): OpenPathEntry[] {
  const ancestorProjects = [...result.path]
    .reverse()
    .filter((a): a is { id: string; type: "project"; title: string } => a.type === "project");
  if (result.type === "project" || result.type === "todo") {
    return [...ancestorProjects, { id: result.id, type: result.type }];
  }
  return ancestorProjects;
}

export function SearchPalette() {
  const isOpen = useUiStore((s) => s.isSearchOpen);
  const setSearchOpen = useUiStore((s) => s.setSearchOpen);
  const select = useUiStore((s) => s.select);
  const setHeadingExpanded = useUiStore((s) => s.setHeadingExpanded);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    setResults([]);
    setSelectedIndex(0);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      getSearchResults(query).then(setResults);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, isOpen]);

  if (!isOpen) return null;

  function close() {
    setSearchOpen(false);
  }

  function chooseResult(result: SearchResult) {
    buildOpenPath(result).forEach((entry, depth) => select(depth, entry));
    for (const ancestor of result.path) {
      if (ancestor.type === "heading") {
        setHeadingExpanded(ancestor.id, true);
      }
    }
    close();
  }

  return (
    <div role="dialog" aria-label="Search">
      <input
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            close();
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedIndex((i) => Math.max(i - 1, 0));
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            const result = results[selectedIndex];
            if (result) chooseResult(result);
          }
        }}
      />
      <ul>
        {results.map((result, index) => (
          <li key={result.id}>
            <button
              type="button"
              aria-current={index === selectedIndex}
              onClick={() => chooseResult(result)}
            >
              {result.title}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
