/**
 * Daemon Utility Functions
 *
 * Shared utilities for checking daemon status across CLI commands.
 */

import { existsSync, readFileSync } from "fs";
import { PID_FILE } from "../../config/paths";

/**
 * Check if daemon is currently running
 *
 * @returns true if daemon is running, false otherwise
 */
export function isDaemonRunning(): boolean {
  if (!existsSync(PID_FILE)) {
    return false;
  }

  try {
    const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);
    // Check if process exists by sending signal 0
    // This doesn't kill the process, just checks if it exists
    process.kill(pid, 0);
    return true;
  } catch {
    // Process doesn't exist
    return false;
  }
}

/**
 * Get daemon PID
 *
 * @returns PID if daemon is running, null otherwise
 */
export function getDaemonPid(): number | null {
  if (!existsSync(PID_FILE)) {
    return null;
  }

  try {
    const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);
    // Verify process exists
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
}
