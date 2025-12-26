/**
 * Preflight Checker
 *
 * Validates repository state before task execution.
 * Ensures repo is clean and accessible.
 */

import * as fs from "node:fs";
import { SessionManager } from "./session-manager";
import { EventLevel, EventType } from "@nightshift/shared";
import { execa } from "execa";

export interface PreflightResult {
  passed: boolean;
  error?: {
    code: string;
    message: string;
  };
}

export class PreflightChecker {
  constructor(private sessionManager: SessionManager) {}

  /**
   * Run all preflight checks for a repository
   */
  async check(repoPath: string): Promise<PreflightResult> {
    this.sessionManager.emit(EventType.PREFLIGHT_STARTED, EventLevel.INFO, {
      repoPath,
    });

    try {
      // Check 1: Directory exists
      if (!fs.existsSync(repoPath)) {
        return this.fail("REPO_NOT_FOUND", `Repository path does not exist: ${repoPath}`);
      }

      // Check 2: Is a git repository
      const isGit = await this.isGitRepository(repoPath);
      if (!isGit) {
        return this.fail("NOT_GIT_REPO", `Path is not a git repository: ${repoPath}`);
      }

      // Check 3: Check for uncommitted changes
      const hasChanges = await this.hasUncommittedChanges(repoPath);
      if (hasChanges) {
        return this.fail(
          "NEEDS_HUMAN_GIT_DIRTY",
          "Repo has uncommitted changes. Please stash or commit before running tasks.",
        );
      }

      // Check 4: Check for untracked files (optional warning)
      const hasUntracked = await this.hasUntrackedFiles(repoPath);
      if (hasUntracked) {
        this.sessionManager.emit(EventType.PREFLIGHT_PASSED, EventLevel.WARN, {
          warning: "Repository has untracked files",
        });
      } else {
        // All checks passed
        this.sessionManager.emit(EventType.PREFLIGHT_PASSED, EventLevel.INFO, {
          repoPath,
        });
      }

      return { passed: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown preflight error";
      return this.fail("PREFLIGHT_ERROR", message);
    }
  }

  private fail(code: string, message: string): PreflightResult {
    this.sessionManager.emit(EventType.PREFLIGHT_FAILED, EventLevel.ERROR, {
      code,
      message,
    });

    return {
      passed: false,
      error: { code, message },
    };
  }

  private async isGitRepository(repoPath: string): Promise<boolean> {
    try {
      await execa("git", ["rev-parse", "--git-dir"], { cwd: repoPath });
      return true;
    } catch {
      return false;
    }
  }

  private async hasUncommittedChanges(repoPath: string): Promise<boolean> {
    try {
      // Check for staged and unstaged changes
      const { stdout } = await execa("git", ["status", "--porcelain"], { cwd: repoPath });
      const lines = stdout.trim().split("\n").filter(Boolean);

      // Filter out untracked files (lines starting with ??)
      const changedFiles = lines.filter((line) => !line.startsWith("??"));
      return changedFiles.length > 0;
    } catch {
      return true; // Assume dirty if we can't check
    }
  }

  private async hasUntrackedFiles(repoPath: string): Promise<boolean> {
    try {
      const { stdout } = await execa("git", ["status", "--porcelain"], { cwd: repoPath });
      const lines = stdout.trim().split("\n").filter(Boolean);

      // Check for untracked files (lines starting with ??)
      return lines.some((line) => line.startsWith("??"));
    } catch {
      return false;
    }
  }
}
