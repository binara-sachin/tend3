export type NodeType = "project" | "heading" | "todo";

export interface NodeRow {
  id: string;
  parentId: string | null;
  type: NodeType;
  title: string;
  notes: string;
  sortKey: string;
  whenDate: string | null;
  deadline: string | null;
  completedAt: string | null;
  deletedAt: string | null;
  isSystem: boolean;
  openDescendantCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface NewNodeInput {
  id: string;
  parentId: string | null;
  type: NodeType;
  title: string;
  notes: string;
  sortKey: string;
  whenDate: string | null;
  deadline: string | null;
  createdAt: string;
  updatedAt: string;
}
