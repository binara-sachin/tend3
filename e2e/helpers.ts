import type { APIRequestContext } from "@playwright/test";

export interface NodeDetail {
  id: string;
  type: "project" | "heading" | "todo";
  title: string;
  notes: string;
  whenDate: string | null;
  deadline: string | null;
  completedAt: string | null;
}

async function runCommand(
  request: APIRequestContext,
  type: string,
  payload: object,
): Promise<NodeDetail> {
  const res = await request.post("/api/commands", { data: { type, payload } });
  if (!res.ok()) {
    throw new Error(`${type} failed (${res.status()}): ${await res.text()}`);
  }
  return res.json();
}

let sequence = 0;
/** A title that won't collide with another test's fixtures in the shared E2E database. */
export function uniqueTitle(prefix: string): string {
  sequence += 1;
  return `${prefix} ${Date.now()}-${sequence}`;
}

export async function createProject(
  request: APIRequestContext,
  title: string,
): Promise<NodeDetail> {
  return runCommand(request, "CreateNode", {
    parentId: null,
    type: "project",
    title,
    notes: "",
    sortKey: "a0",
    whenDate: null,
    deadline: null,
  });
}

export interface CreateTodoOptions {
  title: string;
  sortKey: string;
  notes?: string;
  whenDate?: string | null;
  deadline?: string | null;
}

export async function createTodo(
  request: APIRequestContext,
  parentId: string,
  options: CreateTodoOptions,
): Promise<NodeDetail> {
  return runCommand(request, "CreateNode", {
    parentId,
    type: "todo",
    title: options.title,
    notes: options.notes ?? "",
    sortKey: options.sortKey,
    whenDate: options.whenDate ?? null,
    deadline: options.deadline ?? null,
  });
}

export async function setCompleted(
  request: APIRequestContext,
  nodeId: string,
  completed: boolean,
): Promise<NodeDetail> {
  return runCommand(request, "SetCompleted", { nodeId, completed });
}

export async function trashNode(request: APIRequestContext, nodeId: string): Promise<NodeDetail> {
  return runCommand(request, "TrashNode", { nodeId });
}
