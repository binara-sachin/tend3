import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getColumn, getLogbook, getNode, getToday, getTrash, runCommand } from "../api/client.js";
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

export function useRunCommand() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (vars: RunCommandVars) => runCommand(vars.type, vars.payload),
    onSuccess: (_data, vars) => {
      if (vars.parentId !== undefined) {
        queryClient.invalidateQueries({ queryKey: ["columns", vars.parentId] });
      }
      for (const entry of useUiStore.getState().openPath) {
        queryClient.invalidateQueries({ queryKey: ["columns", entry.id] });
      }
      queryClient.invalidateQueries({ queryKey: ["today"] });
      queryClient.invalidateQueries({ queryKey: ["logbook"] });
      queryClient.invalidateQueries({ queryKey: ["trash"] });
    },
  });
}
