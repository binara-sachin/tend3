import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { getColumn, getLogbook, getNode, getToday, getTrash, redo, runCommand, undo } from "../api/client.js";
import { useUiStore } from "../store/uiStore.js";

export function useColumn(parentId: string | null) {
  return useQuery({
    queryKey: ["columns", parentId],
    queryFn: () => getColumn(parentId),
  });
}

export function useNode(id: string | null) {
  return useQuery({
    queryKey: ["node", id],
    queryFn: () => getNode(id as string),
    enabled: id != null,
  });
}

export function useToday() {
  return useQuery({ queryKey: ["today"], queryFn: () => getToday() });
}

export function useLogbook() {
  return useQuery({ queryKey: ["logbook"], queryFn: () => getLogbook() });
}

export function useTrash() {
  return useQuery({ queryKey: ["trash"], queryFn: () => getTrash() });
}

export interface RunCommandVars {
  type: string;
  payload: object;
  /** The parentId of the column the mutated node lives in, for cache invalidation. Omit for commands with no single column (e.g. Trash actions). */
  parentId?: string;
}

function invalidateAfterMutation(queryClient: QueryClient, parentId?: string) {
  if (parentId !== undefined) {
    queryClient.invalidateQueries({ queryKey: ["columns", parentId] });
  }
  const openPath = useUiStore.getState().openPath;
  for (const entry of openPath) {
    queryClient.invalidateQueries({ queryKey: ["columns", entry.id] });
  }
  const lastEntry = openPath.at(-1);
  if (lastEntry?.type === "todo") {
    queryClient.invalidateQueries({ queryKey: ["node", lastEntry.id] });
  }
  queryClient.invalidateQueries({ queryKey: ["today"] });
  queryClient.invalidateQueries({ queryKey: ["logbook"] });
  queryClient.invalidateQueries({ queryKey: ["trash"] });
}

export function useRunCommand() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (vars: RunCommandVars) => runCommand(vars.type, vars.payload),
    onSuccess: (_data, vars) => invalidateAfterMutation(queryClient, vars.parentId),
  });
}

export function useUndo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => undo(),
    onSuccess: () => invalidateAfterMutation(queryClient),
  });
}

export function useRedo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => redo(),
    onSuccess: () => invalidateAfterMutation(queryClient),
  });
}
