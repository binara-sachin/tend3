import type { ColumnRow } from "../../../queries/getColumn.js";
import type { LogbookGroup } from "../../../queries/getLogbook.js";
import type { NodeDetail } from "../../../queries/getNode.js";
import type { SearchResult } from "../../../queries/getSearchResults.js";
import type { TodayGroup } from "../../../queries/getToday.js";

export type { ColumnRow, LogbookGroup, NodeDetail, SearchResult, TodayGroup };

// Node's global fetch (unlike a browser's) has no implicit base URL, so a
// bare relative path fails to parse under Vitest. window.location.origin
// resolves correctly both in a real browser and in the jsdom test environment.
function apiUrl(path: string): string {
  return new URL(path, window.location.origin).toString();
}

async function parseOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed with status ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function getColumn(parentId: string | null): Promise<ColumnRow[]> {
  const res = await fetch(apiUrl(`/api/columns/${parentId ?? "root"}`));
  return parseOrThrow<ColumnRow[]>(res);
}

export async function getNode(id: string): Promise<NodeDetail> {
  const res = await fetch(apiUrl(`/api/nodes/${id}`));
  return parseOrThrow<NodeDetail>(res);
}

export async function runCommand(type: string, payload: object): Promise<NodeDetail> {
  const res = await fetch(apiUrl("/api/commands"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, payload }),
  });
  return parseOrThrow<NodeDetail>(res);
}

export async function getToday(): Promise<TodayGroup[]> {
  const res = await fetch(apiUrl("/api/today"));
  return parseOrThrow<TodayGroup[]>(res);
}

export async function getLogbook(): Promise<LogbookGroup[]> {
  const res = await fetch(apiUrl("/api/logbook"));
  return parseOrThrow<LogbookGroup[]>(res);
}

export async function getTrash(): Promise<ColumnRow[]> {
  const res = await fetch(apiUrl("/api/trash"));
  return parseOrThrow<ColumnRow[]>(res);
}

export async function getSearchResults(query: string): Promise<SearchResult[]> {
  const res = await fetch(apiUrl(`/api/search?${new URLSearchParams({ q: query })}`));
  return parseOrThrow<SearchResult[]>(res);
}

export async function undo(): Promise<{ ok: boolean }> {
  const res = await fetch(apiUrl("/api/undo"), { method: "POST" });
  return parseOrThrow<{ ok: boolean }>(res);
}

export async function redo(): Promise<{ ok: boolean }> {
  const res = await fetch(apiUrl("/api/redo"), { method: "POST" });
  return parseOrThrow<{ ok: boolean }>(res);
}
