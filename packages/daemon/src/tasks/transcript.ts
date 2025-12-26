/**
 * Task Transcript Utilities
 *
 * Ensures the initial task prompt is available immediately in the transcript
 * (even before the task is claimed/started).
 */

import { getTaskTranscriptPath } from "../config/paths";
import { TranscriptWriter } from "../executor/transcript-writer";

/**
 * Ensure the task's initial prompt is present as a `type:"user"` transcript message.
 *
 * This is idempotent: if the transcript already has any entries, it does nothing.
 */
export function ensureInitialPromptInTranscript(params: {
  taskId: string;
  prompt: string;
  createdAt?: string;
  dataDirOverride?: string;
}): void {
  const prompt = params.prompt.trim();
  if (!prompt) return;

  const transcriptPath = getTaskTranscriptPath(params.taskId, params.dataDirOverride);

  // If any transcript entries exist already, assume the prompt is already represented.
  // (Avoids duplication when called from multiple code paths.)
  const existing = TranscriptWriter.readEntries(transcriptPath, 0);
  if (existing.length > 0) return;

  TranscriptWriter.appendMessage(
    transcriptPath,
    {
      type: "user",
      timestamp: params.createdAt ?? new Date().toISOString(),
      content: prompt,
    },
    params.createdAt ?? undefined,
  );
}
