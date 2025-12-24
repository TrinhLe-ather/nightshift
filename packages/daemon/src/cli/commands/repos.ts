/**
 * Repos CLI Command
 *
 * Manage configured repositories via command line.
 *
 * Usage:
 *   nightshift repos add /path/to/repo
 *   nightshift repos list
 *   nightshift repos remove <name>
 */

import { existsSync } from "fs";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, initDb, repos, tasks } from "../../db/drizzle";
import {
  createRepo,
  deleteRepo,
  getAllRepos,
  getRepoByPath,
  isGitRepository,
} from "../../tasks/repos";

/**
 * Format table for CLI output
 */
function formatTable(repoList: Array<{ name: string; path: string; defaultBranch: string }>): void {
  if (repoList.length === 0) {
    console.log("\n  No repositories configured.\n");
    console.log("  Add a repo with: nightshift repos add /path/to/repo");
    return;
  }

  // Calculate column widths
  const nameWidth = Math.max(4, ...repoList.map((r) => r.name.length));
  const pathWidth = Math.max(4, ...repoList.map((r) => r.path.length));
  const branchWidth = Math.max(6, ...repoList.map((r) => r.defaultBranch.length));

  // Header
  console.log();
  console.log(
    `  ${"NAME".padEnd(nameWidth)}  ${"PATH".padEnd(pathWidth)}  ${"BRANCH".padEnd(branchWidth)}`,
  );
  console.log(`  ${"-".repeat(nameWidth)}  ${"-".repeat(pathWidth)}  ${"-".repeat(branchWidth)}`);

  // Rows
  for (const repo of repoList) {
    console.log(
      `  ${repo.name.padEnd(nameWidth)}  ${repo.path.padEnd(pathWidth)}  ${repo.defaultBranch.padEnd(branchWidth)}`,
    );
  }
  console.log();
}

/**
 * Add a new repository
 */
async function addRepo(path: string): Promise<void> {
  // Validate path exists
  if (!existsSync(path)) {
    console.error(`Error: Path does not exist: ${path}`);
    process.exit(1);
  }

  // Validate it's a git repository
  if (!isGitRepository(path)) {
    console.error(`Error: Path is not a git repository: ${path}`);
    process.exit(1);
  }

  // Initialize database
  initDb();

  // Check if already exists
  const existing = getRepoByPath(path);
  if (existing) {
    console.log(`Repo already configured: ${existing.name} at ${path}`);
    return;
  }

  // Create repo
  const repo = createRepo({ path });
  console.log(`Added repo: ${repo.name} at ${repo.path}`);
  console.log(`  Default branch: ${repo.defaultBranch}`);
}

/**
 * List all configured repositories
 */
async function listRepos(): Promise<void> {
  initDb();

  const repoList = getAllRepos();
  formatTable(repoList);
}

/**
 * Remove a repository by name
 */
async function removeRepo(name: string): Promise<void> {
  initDb();
  const db = getDb();

  // Find repo by name
  const repo = db.select().from(repos).where(eq(repos.name, name)).get();

  if (!repo) {
    console.error(`Error: Repo not found: ${name}`);
    console.log("\nConfigured repos:");
    const all = getAllRepos();
    if (all.length === 0) {
      console.log("  (none)");
    } else {
      for (const r of all) {
        console.log(`  - ${r.name}`);
      }
    }
    process.exit(1);
  }

  // Check for active tasks
  const activeTask = db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.repoId, repo.id), inArray(tasks.status, ["pending", "running"])))
    .limit(1)
    .get();

  if (activeTask) {
    console.error(`Error: Cannot remove repo with active tasks`);
    console.error(`  Complete or cancel pending tasks first.`);
    process.exit(1);
  }

  // Delete
  deleteRepo(repo.id);
  console.log(`Removed repo: ${repo.name}`);
}

/**
 * Show help for repos command
 */
function showHelp(): void {
  console.log(`
Night Shift - Repository Management

Usage:
  nightshift repos <command> [args]

Commands:
  add <path>     Add a git repository to configuration
  list           List all configured repositories
  remove <name>  Remove a repository from configuration

Examples:
  nightshift repos add /Users/you/projects/my-repo
  nightshift repos list
  nightshift repos remove my-repo
`);
}

/**
 * Main repos command entry point
 */
export async function reposCommand(): Promise<void> {
  const args = process.argv.slice(3);
  const subcommand = args[0];

  switch (subcommand) {
    case "add":
      if (!args[1]) {
        console.error("Error: Path is required");
        console.error("Usage: nightshift repos add /path/to/repo");
        process.exit(1);
      }
      await addRepo(args[1]);
      break;

    case "list":
    case "ls":
      await listRepos();
      break;

    case "remove":
    case "rm":
      if (!args[1]) {
        console.error("Error: Repo name is required");
        console.error("Usage: nightshift repos remove <name>");
        process.exit(1);
      }
      await removeRepo(args[1]);
      break;

    case "help":
    case "-h":
    case "--help":
    case undefined:
      showHelp();
      break;

    default:
      console.error(`Unknown repos command: ${subcommand}`);
      console.error('Run "nightshift repos help" for usage');
      process.exit(1);
  }
}
