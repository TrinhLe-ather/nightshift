/**
 * Binary Installer
 *
 * Safely replaces the current binary with an update.
 */

import { chmodSync, copyFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from "fs";
import path from "path";
import { inArray } from "drizzle-orm";
import { BIN_DIR, BINARY_PATH } from "../config/paths";

/**
 * Installation result
 */
export interface InstallResult {
  success: boolean;
  error?: string;
  requiresRestart: boolean;
}

/**
 * Check if running as compiled binary (vs dev mode with bun)
 */
export function isCompiledBinary(): boolean {
  // In compiled mode, execPath ends with 'nightshift' (or 'nightshift.exe' on Windows)
  const execName = path.basename(process.execPath);
  return execName === "nightshift" || execName === "nightshift.exe";
}

/**
 * Get path to installed binary (matches install.sh location)
 * Always returns ~/.nightshift/bin/nightshift regardless of how we're running
 */
export function getInstallPath(): string {
  return BINARY_PATH;
}

/**
 * Get path to current running binary
 * In dev mode, returns the standard install path (not bun)
 */
export function getCurrentBinaryPath(): string {
  if (isCompiledBinary()) {
    return process.execPath;
  }
  // In dev mode, use standard install path
  return BINARY_PATH;
}

/**
 * Check if a task is currently running
 * This should be called before performing update
 */
export async function hasActiveTask(): Promise<boolean> {
  try {
    const { getDb, tasks } = await import("../db/drizzle");
    const db = getDb();

    const activeTask = db
      .select({ id: tasks.id })
      .from(tasks)
      .where(inArray(tasks.status, ["running", "claimed"]))
      .limit(1)
      .get();

    return !!activeTask;
  } catch {
    // If we can't check, assume there might be an active task
    return true;
  }
}

/**
 * Install update by replacing current binary
 *
 * Process:
 * 1. Check no active tasks
 * 2. Ensure bin directory exists
 * 3. Write new binary to temp location
 * 4. Rename current binary to .backup (if exists)
 * 5. Move new binary to main location
 * 6. Set executable permissions
 * 7. Schedule restart
 */
export async function installUpdate(newBinaryPath: string): Promise<InstallResult> {
  // Check for active tasks
  if (await hasActiveTask()) {
    return {
      success: false,
      error: "Cannot update while a task is running. Please wait for the task to complete.",
      requiresRestart: false,
    };
  }

  // Always install to standard location (matches install.sh)
  const installPath = getInstallPath();
  const backupPath = `${installPath}.backup`;
  const tempPath = `${installPath}.new`;

  try {
    // Validate new binary exists
    if (!existsSync(newBinaryPath)) {
      return {
        success: false,
        error: `Update file not found: ${newBinaryPath}`,
        requiresRestart: false,
      };
    }

    // Ensure bin directory exists (matches install.sh: mkdir -p "$INSTALL_DIR")
    if (!existsSync(BIN_DIR)) {
      mkdirSync(BIN_DIR, { recursive: true });
    }

    // Copy new binary to temp location next to install path
    copyFileSync(newBinaryPath, tempPath);

    // Set executable permissions on Unix
    if (process.platform !== "win32") {
      chmodSync(tempPath, 0o755);
    }

    // Remove old backup if exists
    if (existsSync(backupPath)) {
      try {
        unlinkSync(backupPath);
      } catch {
        // Ignore errors removing old backup
      }
    }

    // Rename current binary to backup (if it exists)
    if (existsSync(installPath)) {
      renameSync(installPath, backupPath);
    }

    // Move new binary to install location
    renameSync(tempPath, installPath);

    // Set executable permissions again (in case rename changed them)
    if (process.platform !== "win32") {
      chmodSync(installPath, 0o755);
    }

    return {
      success: true,
      requiresRestart: true,
    };
  } catch (error) {
    // Attempt to restore from backup
    try {
      if (existsSync(backupPath) && !existsSync(installPath)) {
        renameSync(backupPath, installPath);
      }
      if (existsSync(tempPath)) {
        unlinkSync(tempPath);
      }
    } catch {
      // Restore failed - this is a critical error
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Installation failed",
      requiresRestart: false,
    };
  }
}

/**
 * Clean up backup after successful update
 */
export function cleanupBackup(): void {
  const installPath = getInstallPath();
  const backupPath = `${installPath}.backup`;

  if (existsSync(backupPath)) {
    try {
      unlinkSync(backupPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Restore from backup (rollback)
 */
export function rollbackUpdate(): boolean {
  const installPath = getInstallPath();
  const backupPath = `${installPath}.backup`;

  if (!existsSync(backupPath)) {
    return false;
  }

  try {
    // Remove current (potentially broken) binary
    if (existsSync(installPath)) {
      unlinkSync(installPath);
    }

    // Restore from backup
    renameSync(backupPath, installPath);

    return true;
  } catch {
    return false;
  }
}

/**
 * Schedule daemon restart
 * Uses exec to spawn new process and exit current one
 */
export async function scheduleRestart(): Promise<void> {
  const binaryPath = getInstallPath();

  console.log("Restarting Night Shift...");

  // Spawn new process
  const subprocess = Bun.spawn([binaryPath, "start"], {
    stdio: ["ignore", "ignore", "ignore"],
    detached: true,
  });

  // Let subprocess detach
  subprocess.unref();

  // Give it a moment to start
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Exit current process
  process.exit(0);
}
