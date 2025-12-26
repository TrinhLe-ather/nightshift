/**
 * Workflows Hooks
 *
 * Fetches and manages workflows with React Query.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client } from "@/web/integrations/orpc";

/**
 * Workflow summary type
 */
export interface WorkflowSummary {
  id: string;
  name: string;
  description: string;
  isBuiltin: boolean;
  stepCount: number;
  model?: string;
}

/**
 * Workflow step type
 */
export interface WorkflowStep {
  name: string;
  prompt: string;
  model?: string;
  tools?: {
    enable?: string[];
    disable?: string[];
  };
  maxRetries?: number;
  autoCommit?: boolean;
}

/**
 * Workflow definition type
 */
export interface WorkflowDefinition {
  name: string;
  description: string;
  version: string;
  model?: string;
  inputs?: Record<
    string,
    {
      type: "string" | "number" | "boolean" | "enum";
      description: string;
      required: boolean;
      default?: unknown;
      values?: string[];
    }
  >;
  steps: WorkflowStep[];
}

/**
 * Full workflow detail type
 */
export interface WorkflowDetail {
  id: string;
  name: string;
  description: string;
  definition: WorkflowDefinition;
  isBuiltin: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Fetch all available workflows
 */
export function useWorkflows() {
  return useQuery({
    queryKey: ["workflows"],
    queryFn: async () => {
      return client.workflows.list({});
    },
    refetchInterval: 5000,
  });
}

/**
 * Fetch a specific workflow by ID
 */
export function useWorkflow(id: string) {
  return useQuery({
    queryKey: ["workflows", id],
    queryFn: async () => {
      return client.workflows.get({ id });
    },
    enabled: !!id,
  });
}

/**
 * Create a new custom workflow
 */
export function useCreateWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      name: string;
      description: string;
      definition: WorkflowDefinition;
    }) => client.workflows.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
    },
  });
}

/**
 * Update an existing custom workflow
 */
export function useUpdateWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      id: string;
      name?: string;
      description?: string;
      definition?: WorkflowDefinition;
    }) => client.workflows.update(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      queryClient.invalidateQueries({ queryKey: ["workflows", variables.id] });
    },
  });
}

/**
 * Delete a custom workflow
 */
export function useDeleteWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => client.workflows.delete({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
    },
  });
}

/**
 * Clone a workflow to create a custom copy
 */
export function useCloneWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { sourceId: string; name: string; description?: string }) =>
      client.workflows.clone(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
    },
  });
}
