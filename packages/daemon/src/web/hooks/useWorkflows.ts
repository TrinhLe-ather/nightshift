/**
 * Workflows Hooks
 *
 * Fetches and manages workflows with React Query.
 * NOTE: These hooks require the workflows API contract to be implemented.
 */

import { useQuery } from "@tanstack/react-query";
import { client } from "@/web/integrations/orpc";

/**
 * Fetch all available workflows
 */
export function useWorkflows() {
  return useQuery({
    queryKey: ["workflows"],
    queryFn: async () => {
      // TODO: Uncomment when workflows API contract is implemented
      // return client.workflows.list({});

      // Temporary placeholder until API is ready
      return {
        workflows: [] as Array<{
          id: string;
          name: string;
          description: string;
          isBuiltin: boolean;
        }>,
      };
    },
  });
}

/**
 * Fetch a specific workflow by ID
 */
export function useWorkflow(id: string) {
  return useQuery({
    queryKey: ["workflow", id],
    queryFn: async () => {
      // TODO: Uncomment when workflows API contract is implemented
      // return client.workflows.get({ id });

      // Temporary placeholder until API is ready
      return {
        workflow: null as {
          id: string;
          name: string;
          description: string;
          definition: unknown;
        } | null,
      };
    },
    enabled: !!id,
  });
}
