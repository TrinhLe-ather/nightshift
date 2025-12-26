/**
 * Repo Lock Manager
 *
 * Implements exclusive locking for task coordination:
 * - Exclusive locks: Single workflow task, blocks all other direct mode tasks
 *
 * Worktree mode tasks don't use locks (always allowed).
 */

import { and, eq } from "drizzle-orm";
import { getDb, repoLocks, type RepoLock } from "../db/drizzle";

export type LockType = "exclusive";

export interface LockAcquisitionResult {
  success: boolean;
  error?: string;
  lockHolders?: string[]; // TaskIds of tasks holding locks
}

export class RepoLockManager {
  /**
   * Try to acquire exclusive lock (for workflows)
   * Requires no other locks exist (shared or exclusive)
   *
   * RACE CONDITION FIX:
   * Wraps the SELECT and INSERT in a database transaction to ensure atomicity.
   * Previously, another task could acquire a lock between the check and the insert,
   * allowing multiple exclusive locks or exclusive + shared locks concurrently.
   */
  async acquireExclusive(repoId: string, taskId: string): Promise<LockAcquisitionResult> {
    const db = getDb();

    try {
      // Use a transaction to atomically check for existing locks and insert the exclusive lock
      const result = await db.transaction(async (tx) => {
        // Check for ANY locks (shared or exclusive) within the transaction
        const existingLocks = tx.select().from(repoLocks).where(eq(repoLocks.repoId, repoId)).all();

        if (existingLocks.length > 0) {
          const lockHolders = existingLocks.map((l) => l.taskId);
          const lockTypes = existingLocks.map((l) => l.type).join(", ");

          console.log(
            `[RepoLockManager] Cannot acquire exclusive lock for task ${taskId}: ` +
              `${existingLocks.length} existing lock(s) (${lockTypes}) held by: ${lockHolders.join(", ")}`
          );

          return {
            success: false,
            error: `Repository locked by ${existingLocks.length} task(s)`,
            lockHolders,
          };
        }

        // No locks → Acquire exclusive lock
        const lockId = `lock_${crypto.randomUUID()}`;

        tx.insert(repoLocks)
          .values({
            id: lockId,
            repoId,
            type: "exclusive",
            taskId,
            acquiredAt: new Date().toISOString(),
          })
          .run();

        console.log(
          `[RepoLockManager] Acquired exclusive lock ${lockId} for task ${taskId} on repo ${repoId}`
        );
        return { success: true, lockId };
      });

      return {
        success: result.success,
        error: result.error,
        lockHolders: result.lockHolders,
      };
    } catch (error) {
      console.error(`[RepoLockManager] Error acquiring exclusive lock for task ${taskId}:`, error);
      return {
        success: false,
        error: `Transaction error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Release lock for a task
   * Removes all locks held by this task on this repo
   */
  async release(repoId: string, taskId: string): Promise<void> {
    const db = getDb();

    db.delete(repoLocks)
      .where(and(eq(repoLocks.repoId, repoId), eq(repoLocks.taskId, taskId)))
      .run();

    console.log(`[RepoLockManager] Released lock(s) for task ${taskId} on repo ${repoId}`);
  }

  /**
   * Release all locks for a task (any repo)
   * Used during task cleanup
   */
  async releaseAll(taskId: string): Promise<void> {
    const db = getDb();

    db.delete(repoLocks).where(eq(repoLocks.taskId, taskId)).run();

    console.log(`[RepoLockManager] Released lock(s) for task ${taskId}`);
  }

  /**
   * Check if repo has exclusive lock
   */
  async hasExclusiveLock(repoId: string): Promise<boolean> {
    const db = getDb();

    const lock = db
      .select()
      .from(repoLocks)
      .where(and(eq(repoLocks.repoId, repoId), eq(repoLocks.type, "exclusive")))
      .get();

    return !!lock;
  }

  /**
   * Get all locks on a repo (for debugging/UI)
   */
  async getLocksForRepo(repoId: string): Promise<RepoLock[]> {
    const db = getDb();

    return db.select().from(repoLocks).where(eq(repoLocks.repoId, repoId)).all();
  }

  /**
   * Get lock info for a task
   */
  async getLockForTask(taskId: string): Promise<RepoLock | null> {
    const db = getDb();

    const lock = db.select().from(repoLocks).where(eq(repoLocks.taskId, taskId)).get();

    return lock || null;
  }

  /**
   * Check if a task can acquire an exclusive lock
   * (doesn't actually acquire, just checks)
   */
  async canAcquireExclusive(repoId: string): Promise<{
    canAcquire: boolean;
    lockHolders?: string[];
  }> {
    const db = getDb();

    const existingLocks = db
      .select()
      .from(repoLocks)
      .where(eq(repoLocks.repoId, repoId))
      .all();

    if (existingLocks.length > 0) {
      return {
        canAcquire: false,
        lockHolders: existingLocks.map((l) => l.taskId),
      };
    }

    return { canAcquire: true };
  }
}
