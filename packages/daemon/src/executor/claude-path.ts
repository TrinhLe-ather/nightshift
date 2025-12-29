/**
 * Claude Code Path Resolution
 *
 * Resolves the path to the Claude Code CLI executable, providing fallbacks
 * for different installation methods. This is necessary because when running
 * as a compiled Bun binary, import.meta.url points to a virtual filesystem
 * path that doesn't exist.
 *
 * Resolution order:
 * 1. CLAUDE_CODE_PATH environment variable (explicit override)
 * 2. Native installer location (~/.claude/local/claude)
 * 3. System PATH (using 'which' or 'where')
 * 4. Fallback to "claude" (let the system try to find it)
 */

import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { execSync } from "child_process";

// Cache the resolved path
let cachedPath: string | null = null;

/**
 * Get the path to the Claude Code executable
 * Returns the first valid path found, or "claude" as fallback
 */
export async function getClaudeCodePath(): Promise<string> {
  // Return cached path if available
  if (cachedPath) {
    return cachedPath;
  }

  // 1. Check environment variable override
  const envPath = process.env.CLAUDE_CODE_PATH;
  if (envPath && existsSync(envPath)) {
    cachedPath = envPath;
    console.log(`[ClaudePath] Using CLAUDE_CODE_PATH: ${envPath}`);
    return cachedPath;
  }

  // 2. Check native installer location
  const nativeInstallerPath = join(homedir(), ".claude", "local", "claude");
  if (existsSync(nativeInstallerPath)) {
    cachedPath = nativeInstallerPath;
    console.log(`[ClaudePath] Using native installer: ${nativeInstallerPath}`);
    return cachedPath;
  }

  // 3. Try to find via system PATH
  const systemPath = findInSystemPath();
  if (systemPath) {
    cachedPath = systemPath;
    console.log(`[ClaudePath] Found in PATH: ${systemPath}`);
    return cachedPath;
  }

  // 4. Fallback to "claude" - let the system try to find it
  console.log(`[ClaudePath] Using fallback: claude`);
  cachedPath = "claude";
  return cachedPath;
}

/**
 * Find Claude Code in system PATH
 */
function findInSystemPath(): string | null {
  try {
    const command = process.platform === "win32" ? "where claude" : "which claude";
    const result = execSync(command, { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] });
    const path = result.trim().split("\n")[0]; // Take first result on Windows
    if (path && existsSync(path)) {
      return path;
    }
  } catch {
    // Command failed, claude not in PATH
  }
  return null;
}

/**
 * Check if Claude Code is installed
 */
export async function isClaudeCodeInstalled(): Promise<boolean> {
  const path = await getClaudeCodePath();
  return path !== "claude" || findInSystemPath() !== null;
}

/**
 * Clear the cached path (useful for testing)
 */
export function clearClaudePathCache(): void {
  cachedPath = null;
}
