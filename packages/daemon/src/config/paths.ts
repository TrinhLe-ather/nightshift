/**
 * Filesystem Path Configuration
 *
 * Cross-platform paths for NightShift daemon data storage.
 * All data lives under ~/.nightshift/
 */

import { homedir } from "os";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";

/**
 * Base directory for all NightShift data
 * - Windows: %USERPROFILE%\.nightshift\
 * - macOS/Linux: ~/.nightshift/
 */
export const NIGHTSHIFT_DIR = join(homedir(), ".nightshift");

/**
 * SQLite database file
 */
export const DB_PATH = join(NIGHTSHIFT_DIR, "nightshift.db");

/**
 * Session logs directory (NDJSON event streams)
 */
export const SESSIONS_DIR = join(NIGHTSHIFT_DIR, "sessions");

/**
 * Auth tokens (encrypted, connected mode)
 */
export const AUTH_PATH = join(NIGHTSHIFT_DIR, "auth.json");

/**
 * Attachments directory (standalone mode)
 */
export const ATTACHMENTS_DIR = join(NIGHTSHIFT_DIR, "attachments");

/**
 * Repo lock files directory
 */
export const LOCKS_DIR = join(NIGHTSHIFT_DIR, "locks");

/**
 * Git worktrees directory for isolated task execution
 */
export const WORKTREES_DIR = join(NIGHTSHIFT_DIR, "worktrees");

/**
 * PID file for daemon process tracking
 */
export const PID_FILE = join(NIGHTSHIFT_DIR, "daemon.pid");

/**
 * Configuration file
 */
export const CONFIG_PATH = join(NIGHTSHIFT_DIR, "config.json");

/**
 * Default port for local web server
 */
export const DEFAULT_PORT = 3847;

/**
 * Local web server URL
 */
export const LOCAL_URL = `http://localhost:${DEFAULT_PORT}`;

/**
 * Ensures ~/.nightshift directory structure exists
 * Creates all required directories if they don't exist
 */
export function ensureNightShiftDirectories(): void {
  const dirs = [NIGHTSHIFT_DIR, SESSIONS_DIR, ATTACHMENTS_DIR, LOCKS_DIR, WORKTREES_DIR];

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Get session log file path for a given session ID
 */
export function getSessionPath(sessionId: string): string {
  return join(SESSIONS_DIR, `${sessionId}.ndjson`);
}

/**
 * Get repo lock file path for a given repo ID
 */
export function getRepoLockPath(repoId: string): string {
  return join(LOCKS_DIR, `${repoId}.lock`);
}
