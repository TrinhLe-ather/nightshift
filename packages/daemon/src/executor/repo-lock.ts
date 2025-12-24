/**
 * Repo Lock
 *
 * Cross-process safe locking mechanism for repositories.
 * Ensures only one task runs per repository at a time.
 */

import * as fs from "node:fs";
import * as path from "node:path";

const LOCK_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours default timeout

export interface LockInfo {
  taskId: string;
  acquiredAt: string;
  pid: number;
}

export class RepoLock {
  private locksDir: string;

  constructor(dataDir: string) {
    this.locksDir = path.join(dataDir, "locks");
    this.ensureLocksDir();
  }

  private ensureLocksDir(): void {
    if (!fs.existsSync(this.locksDir)) {
      fs.mkdirSync(this.locksDir, { recursive: true });
    }
  }

  private getLockPath(repoPath: string): string {
    // Create a safe filename from the repo path
    const safeName = repoPath.replace(/[^a-zA-Z0-9]/g, "_");
    return path.join(this.locksDir, `${safeName}.lock`);
  }

  /**
   * Attempt to acquire a lock on a repository
   */
  acquire(repoPath: string, taskId: string): boolean {
    const lockPath = this.getLockPath(repoPath);

    // Check for existing lock
    if (fs.existsSync(lockPath)) {
      try {
        const content = fs.readFileSync(lockPath, "utf-8");
        const lockInfo = JSON.parse(content) as LockInfo;

        // Check if lock is stale (timed out or process dead)
        const lockAge = Date.now() - new Date(lockInfo.acquiredAt).getTime();
        if (lockAge > LOCK_TIMEOUT_MS) {
          // Lock is stale, remove it
          fs.unlinkSync(lockPath);
        } else if (!this.isProcessAlive(lockInfo.pid)) {
          // Process that held the lock is dead
          fs.unlinkSync(lockPath);
        } else {
          // Lock is held by another active process
          return false;
        }
      } catch {
        // Malformed lock file, remove it
        fs.unlinkSync(lockPath);
      }
    }

    // Try to acquire lock
    const lockInfo: LockInfo = {
      taskId,
      acquiredAt: new Date().toISOString(),
      pid: process.pid,
    };

    try {
      // Use exclusive flag to prevent race conditions
      fs.writeFileSync(lockPath, JSON.stringify(lockInfo), { flag: "wx" });
      return true;
    } catch (error: any) {
      if (error.code === "EEXIST") {
        // Another process acquired the lock first
        return false;
      }
      throw error;
    }
  }

  /**
   * Release a lock on a repository
   */
  release(repoPath: string, taskId: string): boolean {
    const lockPath = this.getLockPath(repoPath);

    if (!fs.existsSync(lockPath)) {
      return true; // Already released
    }

    try {
      const content = fs.readFileSync(lockPath, "utf-8");
      const lockInfo = JSON.parse(content) as LockInfo;

      // Only release if we own the lock
      if (lockInfo.taskId === taskId && lockInfo.pid === process.pid) {
        fs.unlinkSync(lockPath);
        return true;
      }

      return false; // Don't own the lock
    } catch {
      return false;
    }
  }

  /**
   * Check if a repository is locked
   */
  isLocked(repoPath: string): LockInfo | null {
    const lockPath = this.getLockPath(repoPath);

    if (!fs.existsSync(lockPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(lockPath, "utf-8");
      const lockInfo = JSON.parse(content) as LockInfo;

      // Check if lock is still valid
      const lockAge = Date.now() - new Date(lockInfo.acquiredAt).getTime();
      if (lockAge > LOCK_TIMEOUT_MS || !this.isProcessAlive(lockInfo.pid)) {
        return null; // Stale lock
      }

      return lockInfo;
    } catch {
      return null;
    }
  }

  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
}
