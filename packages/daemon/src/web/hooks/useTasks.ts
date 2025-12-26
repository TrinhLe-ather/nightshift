/**
 * Tasks Hooks
 *
 * Fetches and manages tasks with React Query.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client } from "@/web/integrations/orpc";

export function useTasks(params?: {
  status?: string;
  repoId?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: ["tasks", params],
    queryFn: () => client.tasks.list(params ?? {}),
    refetchInterval: 2000,
  });
}

export function useTask(id: string) {
  return useQuery({
    queryKey: ["task", id],
    queryFn: () => client.tasks.get({ id }),
    enabled: !!id,
    refetchInterval: 2000,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      prompt: string;
      repoId?: string;
      priority?: "low" | "medium" | "high" | "urgent";
      githubIssueUrl?: string;
      branch?: string;
      autoYes?: boolean;
    }) => client.tasks.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["status"] });
    },
  });
}

type TaskStatus =
  | "pending"
  | "claimed"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "needs_human"
  | "canceled";
type TaskPriority = "low" | "medium" | "high" | "urgent";

export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { status?: TaskStatus; priority?: TaskPriority };
    }) => client.tasks.update({ id, ...data }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["task", id] });
      queryClient.invalidateQueries({ queryKey: ["status"] });
    },
  });
}

export function useCancelTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => client.tasks.cancel({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["status"] });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, deleteBranch }: { id: string; deleteBranch?: boolean }) =>
      client.tasks.remove({ id, deleteBranch }),
    onSuccess: (_, { id }) => {
      // Remove from cache immediately
      queryClient.removeQueries({ queryKey: ["task", id] });
      // Refetch task lists
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["status"] });
    },
  });
}

export function usePauseTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: "manual" }) =>
      client.tasks.pause({ id, reason }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["task", id] });
      queryClient.invalidateQueries({ queryKey: ["status"] });
    },
  });
}

export function useResumeTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, response }: { id: string; response?: string }) =>
      client.tasks.resume({ id, response }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["task", id] });
      queryClient.invalidateQueries({ queryKey: ["status"] });
    },
  });
}

export function useTaskDiff(id: string, enabled = true) {
  return useQuery({
    queryKey: ["task-diff", id],
    queryFn: () => client.tasks.getDiff({ id }),
    enabled: !!id && enabled,
    refetchInterval: 5000, // Refresh diff every 5s
  });
}
