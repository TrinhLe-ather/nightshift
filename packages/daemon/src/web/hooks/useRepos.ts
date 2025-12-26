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

export function useUpdateRepo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      id: string;
      name?: string;
      defaultBranch?: string;
      executionMode?: "auto" | "worktree" | "direct";
    }) => client.repos.update(data),
    onSuccess: (repo) => {
      queryClient.invalidateQueries({ queryKey: ["repos"] });
      queryClient.invalidateQueries({ queryKey: ["repo", repo.id] });
    },
  });
}

export function useInspectRepo() {
  return useMutation({
    mutationFn: (data: { path: string }) => client.repos.inspect(data),
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

export function useRepoBranches(repoId: string | null) {
  return useQuery({
    queryKey: ["repo-branches", repoId],
    queryFn: () => client.repos.getBranches({ id: repoId! }),
    enabled: !!repoId,
  });
}
