/**
 * Binary Installer
 *
 * Safely replaces the current binary with an update.
 */

import { chmodSync, copyFileSync, existsSync, renameSync, unlinkSync } from "fs";
import { inArray } from "drizzle-orm";

/**
 * Installation result
 */
export interface InstallResult {
  success: boolean;
  error?: string;
  requiresRestart: boolean;
}

/**
 * Get path to current binary
 */
export function getCurrentBinaryPath(): string {
  // Bun.main gives us the entry point, process.execPath gives the bun binary
  // For a compiled binary, process.execPath is our binary
  return process.execPath;
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
 * 2. Write new binary to temp location
 * 3. Rename current binary to .backup
 * 4. Move new binary to main location
 * 5. Set executable permissions
 * 6. Schedule restart
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

  const currentPath = getCurrentBinaryPath();
  const backupPath = `${currentPath}.backup`;
  const tempPath = `${currentPath}.new`;

  try {
    // Validate new binary exists
    if (!existsSync(newBinaryPath)) {
      return {
        success: false,
        error: `Update file not found: ${newBinaryPath}`,
        requiresRestart: false,
      };
    }

    // Copy new binary to temp location next to current binary
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

    // Rename current binary to backup
    renameSync(currentPath, backupPath);

    // Move new binary to main location
    renameSync(tempPath, currentPath);

    // Set executable permissions again (in case rename changed them)
    if (process.platform !== "win32") {
      chmodSync(currentPath, 0o755);
    }

    return {
      success: true,
      requiresRestart: true,
    };
  } catch (error) {
    // Attempt to restore from backup
    try {
      if (existsSync(backupPath) && !existsSync(currentPath)) {
        renameSync(backupPath, currentPath);
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
  const currentPath = getCurrentBinaryPath();
  const backupPath = `${currentPath}.backup`;

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
  const currentPath = getCurrentBinaryPath();
  const backupPath = `${currentPath}.backup`;

  if (!existsSync(backupPath)) {
    return false;
  }

  try {
    // Remove current (potentially broken) binary
    if (existsSync(currentPath)) {
      unlinkSync(currentPath);
    }

    // Restore from backup
    renameSync(backupPath, currentPath);

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
  const binaryPath = getCurrentBinaryPath();

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
