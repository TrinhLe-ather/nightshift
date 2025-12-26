/**
 * Status Hook
 *
 * Fetches and caches daemon status with polling.
 */

import { useQuery } from "@tanstack/react-query";
import { client } from "@/web/integrations/orpc";

export function useStatus() {
  return useQuery({
    queryKey: ["status"],
    queryFn: () => client.status.getStatus(),
    refetchInterval: 2000, // Poll every 2 seconds
    retry: 1, // Only retry once before marking as error
    retryDelay: 500, // Quick retry for faster feedback
  });
}
