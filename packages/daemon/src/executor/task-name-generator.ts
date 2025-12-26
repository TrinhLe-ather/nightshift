/**
 * Task Name Generator
 *
 * Generates concise task names using Claude Agent SDK.
 * Runs in parallel with main task execution without blocking.
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import { updateTask } from "../tasks/repository";
import type { Task } from "@nightshift/shared";

const NAME_GENERATION_TIMEOUT = 30000; // 30 seconds
const MAX_NAME_LENGTH = 50;

export interface NameGenerationResult {
  success: boolean;
  name?: string;
  error?: string;
}

/**
 * Generate a concise task name from the prompt using Claude Haiku
 */
export async function generateTaskName(task: Task): Promise<NameGenerationResult> {
  try {
    const prompt = buildNamePrompt(task.prompt);
    const abortController = new AbortController();

    // Set timeout to prevent hanging
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, NAME_GENERATION_TIMEOUT);

    try {
      // Use SDK query with Haiku model for fast, cheap name generation
      const queryIterator = query({
        prompt,
        options: {
          model: "haiku",
          permissionMode: "bypassPermissions", // No file access needed
          abortController,
        },
      });

      let generatedName = "";

      // Process messages to extract the name
      for await (const msg of queryIterator) {
        if (msg.type === "assistant") {
          const assistantMsg = msg as any; // Type from SDK
          const content = assistantMsg.message?.content;

          if (content && Array.isArray(content)) {
            const textContent = content.find((c: any) => c.type === "text" && "text" in c);
            if (textContent) {
              generatedName = textContent.text.trim();
            }
          }
        }

        if (msg.type === "result") {
          const resultMsg = msg as any;
          if (resultMsg.subtype !== "success") {
            // Generation failed
            return createFallbackResult(task);
          }
        }
      }

      clearTimeout(timeoutId);

      // Validate and clean the generated name
      const cleanedName = cleanGeneratedName(generatedName);

      if (!cleanedName) {
        return createFallbackResult(task);
      }

      return {
        success: true,
        name: cleanedName,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    console.error(`[NameGenerator] Failed for task ${task.id}:`, error);
    return createFallbackResult(task);
  }
}

/**
 * Generate task name and update in database (non-blocking)
 */
export function generateAndStoreTaskName(task: Task): void {
  // Run asynchronously without blocking
  generateTaskName(task)
    .then((result) => {
      if (result.success && result.name) {
        // Update task in database
        updateTask(task.id, { name: result.name });
        console.log(`[NameGenerator] Generated name for task ${task.id}: "${result.name}"`);
      } else {
        console.log(`[NameGenerator] Using fallback name for task ${task.id}`);
      }
    })
    .catch((error) => {
      console.error(`[NameGenerator] Unexpected error for task ${task.id}:`, error);
    });
}

/**
 * Build the prompt for name generation
 */
function buildNamePrompt(taskPrompt: string): string {
  return `Generate a short, concise task name (max ${MAX_NAME_LENGTH} chars) for this task: ${taskPrompt}

IMPORTANT:
- Return ONLY the task name, nothing else
- No quotes, no explanations, no punctuation at the end
- Keep it under ${MAX_NAME_LENGTH} characters
- Make it descriptive but brief
- Use title case

Examples:
Task: "Add authentication to the user login page"
Name: Add User Login Authentication

Task: "Fix the bug where users can't upload images larger than 1MB"
Name: Fix Image Upload Size Limit

Task: "Refactor the database connection pool to use connection pooling"
Name: Refactor Database Connection Pool

Now generate a name for the task above.`;
}

/**
 * Clean and validate generated name
 */
function cleanGeneratedName(name: string): string {
  // Remove quotes if present
  let cleaned = name.replace(/^["']|["']$/g, "");

  // Remove trailing punctuation
  cleaned = cleaned.replace(/[.!?]+$/, "");

  // Trim whitespace
  cleaned = cleaned.trim();

  // Truncate to max length
  if (cleaned.length > MAX_NAME_LENGTH) {
    cleaned = cleaned.substring(0, MAX_NAME_LENGTH).trim();
  }

  // Ensure it's not empty
  if (!cleaned) {
    return "";
  }

  return cleaned;
}

/**
 * Create fallback result using truncated prompt
 */
function createFallbackResult(task: Task): NameGenerationResult {
  const fallbackName = task.prompt.substring(0, MAX_NAME_LENGTH).trim();

  return {
    success: true,
    name: fallbackName,
  };
}
