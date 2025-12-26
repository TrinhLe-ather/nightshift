/**
 * Doctor Command
 *
 * Validates the user's setup before running tasks.
 * Checks for required CLIs, directory structure, and database health.
 */

import { existsSync } from "fs";
import { checkDbHealth, getDbStats } from "../../db";
import { NIGHTSHIFT_DIR } from "../../config/paths";

/**
 * Check result for a single validation
 */
interface CheckResult {
  success: boolean;
  message: string;
  suggestion?: string;
}

/**
 * Run a CLI command and capture its output
 */
async function runCommand(
  command: string,
  args: string[],
): Promise<{
  success: boolean;
  output: string;
}> {
  try {
    const proc = Bun.spawn([command, ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;
    const output = await new Response(proc.stdout).text();

    return {
      success: exitCode === 0,
      output: output.trim(),
    };
  } catch {
    return {
      success: false,
      output: "",
    };
  }
}

/**
 * Check if claude CLI is installed
 */
async function checkClaudeCli(): Promise<CheckResult> {
  const result = await runCommand("claude", ["--version"]);

  if (result.success) {
    // Extract version from output (format may vary)
    const version = result.output.replace("claude version ", "").trim();
    return {
      success: true,
      message: `claude CLI found (${version})`,
    };
  }

  return {
    success: false,
    message: "claude CLI not found",
    suggestion: "Install Claude CLI: npm install -g @anthropic-ai/claude-cli",
  };
}

/**
 * Check if gh CLI is installed and authenticated
 */
async function checkGhCli(): Promise<CheckResult> {
  // First check if gh is installed
  const versionResult = await runCommand("gh", ["--version"]);

  if (!versionResult.success) {
    return {
      success: false,
      message: "gh CLI not found",
      suggestion: "Install GitHub CLI: https://cli.github.com/",
    };
  }

  // Check if authenticated
  const authResult = await runCommand("gh", ["auth", "status"]);

  if (!authResult.success) {
    return {
      success: false,
      message: "gh CLI found but not authenticated",
      suggestion: "Run: gh auth login",
    };
  }

  return {
    success: true,
    message: "gh CLI found and authenticated",
  };
}

/**
 * Check if git CLI is installed
 */
async function checkGitCli(): Promise<CheckResult> {
  const result = await runCommand("git", ["--version"]);

  if (result.success) {
    // Extract version (format: "git version 2.40.0")
    const match = result.output.match(/git version (\S+)/);
    const version = match ? match[1] : "unknown";
    return {
      success: true,
      message: `git CLI found (${version})`,
    };
  }

  return {
    success: false,
    message: "git CLI not found",
    suggestion: "Install Git: https://git-scm.com/downloads",
  };
}

/**
 * Check if Night Shift directory exists
 */
function checkNightShiftDirectory(): CheckResult {
  if (existsSync(NIGHTSHIFT_DIR)) {
    return {
      success: true,
      message: `Night Shift directory exists (${NIGHTSHIFT_DIR})`,
    };
  }

  return {
    success: false,
    message: "Night Shift directory not found",
    suggestion: "Run: nightshift start (to initialize)",
  };
}

/**
 * Check if SQLite database is accessible and healthy
 */
function checkDatabase(): CheckResult {
  try {
    const health = checkDbHealth();

    if (!health.healthy) {
      return {
        success: false,
        message: `SQLite database has issues: ${health.issues.join(", ")}`,
        suggestion: "Run: nightshift start (to reinitialize database)",
      };
    }

    const stats = getDbStats();
    const latest = stats.latestMigrationHash
      ? `, latest ${stats.latestMigrationHash.substring(0, 8)}`
      : "";
    return {
      success: true,
      message: `SQLite database accessible (${stats.tables.length} tables, schema v${stats.schemaVersion}${latest})`,
    };
  } catch {
    return {
      success: false,
      message: "SQLite database not accessible",
      suggestion: "Run: nightshift start (to initialize database)",
    };
  }
}

/**
 * Print check result with appropriate symbol
 */
function printCheckResult(result: CheckResult): void {
  const symbol = result.success ? "\u2713" : "\u2717"; // ✓ or ✗
  console.log(`${symbol} ${result.message}`);

  if (result.suggestion) {
    console.log(`  \u2192 ${result.suggestion}`); // →
  }
}

/**
 * Doctor command - validate system setup
 */
export async function doctorCommand(): Promise<void> {
  console.log("Night Shift Doctor");
  console.log("==================\n");
  console.log("Checking prerequisites...\n");

  const checks: CheckResult[] = [];

  // Run all checks
  checks.push(await checkClaudeCli());
  checks.push(await checkGhCli());
  checks.push(await checkGitCli());
  checks.push(checkNightShiftDirectory());
  checks.push(checkDatabase());

  // Print results
  for (const check of checks) {
    printCheckResult(check);
  }

  // Summary
  const failedChecks = checks.filter((c) => !c.success).length;

  console.log();
  if (failedChecks === 0) {
    console.log("All checks passed! Night Shift is ready to use.");
    process.exit(0);
  } else {
    const plural = failedChecks === 1 ? "check" : "checks";
    console.log(`${failedChecks} ${plural} failed. Please fix the issues above.`);
    process.exit(1);
  }
}
