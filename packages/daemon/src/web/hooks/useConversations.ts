/**
 * Conversations Hooks
 *
 * Manages interactive task conversations and message sending.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client } from "@/web/integrations/orpc";

/**
 * Send a message in an interactive task conversation
 */
export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, message }: { taskId: string; message: string }) =>
      client.conversations.sendMessage({ taskId, message }),
    onSuccess: (_, { taskId }) => {
      // Invalidate related queries to trigger refetch
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["terminal-preview", taskId] });
      queryClient.invalidateQueries({ queryKey: ["sessions", taskId] });
    },
  });
}

/**
 * Get conversation messages for a task
 */
export function useConversationMessages(taskId: string, enabled = true) {
  return useQuery({
    queryKey: ["conversation-messages", taskId],
    queryFn: () => client.conversations.getMessages({ taskId, limit: 100, offset: 0 }),
    enabled: !!taskId && enabled,
    refetchInterval: 2000,
  });
}

/**
 * End an interactive session
 */
export function useEndSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taskId: string) => client.conversations.endSession({ taskId }),
    onSuccess: (_, taskId) => {
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["status"] });
    },
  });
}

/**
 * Rewind to a specific checkpoint
 */
export function useRewindToCheckpoint() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, checkpointId }: { taskId: string; checkpointId: string }) =>
      client.conversations.rewindToCheckpoint({ taskId, checkpointId }),
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      queryClient.invalidateQueries({ queryKey: ["conversation-messages", taskId] });
    },
  });
}
