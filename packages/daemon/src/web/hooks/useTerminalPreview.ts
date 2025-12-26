/**
 * Terminal Preview Hook
 *
 * Fetches live terminal output for running tasks.
 */

import { useQuery } from "@tanstack/react-query";
import { client } from "@/web/integrations/orpc";

/** SDK message type for structured terminal output */
export interface SdkMessage {
	type: "system" | "assistant" | "tool" | "result" | "error" | "user";
	timestamp: string;
	content: string;
	toolName?: string;
	toolArgs?: unknown;
	toolResult?: string;
	sessionId?: string;
}

export interface TerminalPreview {
	content: string;
	/** Structured messages from SDK v2 */
	messages?: SdkMessage[];
	isLive: boolean;
	capturedAt: string;
}

/**
 * Hook to fetch terminal preview for a task
 */
export function useTerminalPreview(taskId: string | undefined, options?: { enabled?: boolean; pollInterval?: number }) {
	const enabled = options?.enabled ?? true;
	const pollInterval = options?.pollInterval ?? 1000; // Default 1 second for live updates

	return useQuery({
		queryKey: ["terminal-preview", taskId],
		queryFn: async (): Promise<TerminalPreview> => {
			if (!taskId) {
				return { content: "", isLive: false, capturedAt: new Date().toISOString() };
			}

			const result = await client.terminal.getPreview({ taskId, lines: 100 });
			return {
				content: result.content,
				messages: result.messages as SdkMessage[] | undefined,
				isLive: result.isLive,
				capturedAt: result.capturedAt,
			};
		},
		enabled: enabled && !!taskId,
		refetchInterval: (query) => {
			// Only poll if task is live
			const data = query.state.data;
			return data?.isLive ? pollInterval : false;
		},
		staleTime: 500, // Consider data stale after 500ms
	});
}
