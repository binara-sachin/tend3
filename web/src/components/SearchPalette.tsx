import { useEffect, useRef, useState } from "react";
import { getSearchResults, type SearchResult } from "../api/client.js";
import { useUiStore, type OpenPathEntry } from "../store/uiStore.js";
import { highlightMatches } from "../format/highlight.js";
import { CircleIcon, CloseIcon, DocumentIcon, FolderIcon, SearchIcon } from "../icons.js";

function ResultIcon({ result, query }: { result: SearchResult; query: string }) {
  const matchesTitle = query !== "" && result.title.toLowerCase().includes(query.toLowerCase());
  if (!matchesTitle) return <DocumentIcon />;
  return result.type === "project" ? <FolderIcon size={16} /> : <CircleIcon size={16} />;
}

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
    <div className="dialog-backdrop" role="dialog" aria-label="Search">
      <div className="search-dialog">
        <div className="search-input-row">
          <span className="search-icon">
            <SearchIcon />
          </span>
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
          <button type="button" className="search-close" aria-label="Close search" onClick={close}>
            <CloseIcon />
          </button>
        </div>
        <ul className="list-reset search-results">
          {results.map((result, index) => (
            <li key={result.id}>
              <button
                type="button"
                className={`search-result${index === selectedIndex ? " search-result--active" : ""}`}
                aria-current={index === selectedIndex}
                onClick={() => chooseResult(result)}
              >
                <span className="search-result-icon">
                  <ResultIcon result={result} query={query} />
                </span>
                <span className="search-result-body">
                  <span className="search-result-title">
                    {highlightMatches(result.title, query).map((segment, i) =>
                      segment.matched ? <mark key={i}>{segment.text}</mark> : segment.text,
                    )}
                  </span>
                  {result.path.length > 0 && (
                    <span className="search-result-path">
                      {[...result.path]
                        .reverse()
                        .map((a) => a.title)
                        .join(" / ")}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="search-hints">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
