import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getColumn, getNode, runCommand } from "../api/client.js";
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

export interface RunCommandVars {
  type: string;
  payload: object;
  /** The parentId of the column the mutated node lives in, for cache invalidation. */
  parentId: string;
}

export function useRunCommand() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (vars: RunCommandVars) => runCommand(vars.type, vars.payload),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["columns", vars.parentId] });
      for (const entry of useUiStore.getState().openPath) {
        queryClient.invalidateQueries({ queryKey: ["columns", entry.id] });
      }
    },
  });
}
