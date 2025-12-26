/**
 * Add Command
 *
 * Add a new task to the local queue.
 *
 * Usage:
 *   nightshift add "Fix the login bug"
 *   nightshift add "task" --repo /path/to/repo
 *   nightshift add "task" --priority high
 */

import { createTask } from "../../tasks/repository";
import { createRepo, getRepoByPath, isGitRepository } from "../../tasks/repos";
import { isDaemonRunning } from "../utils/daemon";
import type { Priority, ClaudeModel } from "@nightshift/shared";
import { resolve } from "path";

/**
 * Parse command line arguments for add command
 */
interface AddCommandArgs {
  prompt: string;
  repo?: string;
  priority?: Priority;
  autoYes?: boolean;
  model?: ClaudeModel;
}

function parseArgs(args: string[]): AddCommandArgs | null {
  // First argument should be the prompt
  if (args.length === 0) {
    return null;
  }

  const prompt = args[0];
  const options: Partial<AddCommandArgs> = { prompt };

  // Parse flags
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--repo" && i + 1 < args.length) {
      options.repo = args[i + 1];
      i++; // Skip next arg
    } else if (arg === "--priority" && i + 1 < args.length) {
      const priority = args[i + 1];
      if (!priority || !["low", "medium", "high", "urgent"].includes(priority)) {
        console.error(`Invalid priority: ${priority}. Must be one of: low, medium, high, urgent`);
        process.exit(1);
      }
      options.priority = priority as Priority;
      i++; // Skip next arg
    } else if (arg === "--model" && i + 1 < args.length) {
      options.model = args[i + 1] as ClaudeModel;
      i++; // Skip next arg
    } else if (arg === "--auto-yes" || arg === "-y") {
      // SECURITY FIX: Require explicit opt-in for auto-approval
      options.autoYes = true;
    } else {
      console.error(`Unknown option: ${arg}`);
      process.exit(1);
    }
  }

  return options as AddCommandArgs;
}

/**
 * Add command handler
 */
export async function addCommand(): Promise<void> {
  const args = process.argv.slice(3); // Skip 'bun', 'cli.ts', 'add'

  // Parse arguments
  const parsed = parseArgs(args);
  if (!parsed) {
    console.error('Usage: nightshift add "task prompt" [--repo path] [--priority level] [--model name] [--auto-yes]');
    console.error("");
    console.error("Options:");
    console.error("  --repo path        Path to git repository");
    console.error("  --priority level   Priority level (low, medium, high, urgent)");
    console.error("  --model name       Claude model to use (opus, sonnet, haiku)");
    console.error("  --auto-yes, -y     Auto-approve all Claude Code prompts (skip manual approval)");
    process.exit(1);
  }

  // Check if daemon is running
  if (!isDaemonRunning()) {
    console.error("Daemon not running. Start with 'nightshift start'");
    process.exit(1);
  }

  // Validate and process repo path
  let repoId: string | undefined;
  let repoPath: string | undefined;
  let repoName: string | undefined;

  if (parsed.repo) {
    // Resolve to absolute path
    const absolutePath = resolve(parsed.repo);

    // Check if path is a valid git repository
    if (!isGitRepository(absolutePath)) {
      console.error(`Error: ${absolutePath} is not a valid git repository`);
      process.exit(1);
    }

    // Get or create repo in database
    let repo = getRepoByPath(absolutePath);
    if (!repo) {
      repo = createRepo({ path: absolutePath });
    }

    repoId = repo.id;
    repoPath = repo.path;
    repoName = repo.name;
  }

  // Create task
  // SECURITY FIX: Default autoYes to false, require explicit --auto-yes flag
  const task = createTask({
    prompt: parsed.prompt,
    repoId,
    repoPath,
    priority: parsed.priority || "medium",
    autoYes: parsed.autoYes || false,
    model: parsed.model,
  });

  // Display confirmation
  console.log(`Task queued: ${task.prompt}`);
  console.log(`  ID: ${task.id}`);
  console.log(`  Priority: ${task.priority}`);
  if (repoName) {
    console.log(`  Repo: ${repoName}`);
  }
}
