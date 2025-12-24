/**
 * Repos Hooks
 *
 * Fetches and manages repos with React Query.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client } from "@/web/integrations/orpc";

export function useRepos() {
  return useQuery({
    queryKey: ["repos"],
    queryFn: () => client.repos.list(),
  });
}

export function useRepo(id: string) {
  return useQuery({
    queryKey: ["repo", id],
    queryFn: () => client.repos.get({ id }),
    enabled: !!id,
  });
}

export function useAddRepo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { path: string; name?: string; defaultBranch?: string }) =>
      client.repos.add(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repos"] });
    },
  });
}

export function useDeleteRepo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => client.repos.remove({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repos"] });
    },
  });
}
