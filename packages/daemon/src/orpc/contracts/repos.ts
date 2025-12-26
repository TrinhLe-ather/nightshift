/**
 * oRPC Contracts for Repos Endpoints
 *
 * Provides type-safe RPC handlers for repository CRUD operations.
 */

import { z } from "zod";
import { existsSync, statSync } from "fs";
import { readdirSync } from "fs";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { getDb, repos, tasks } from "../../db/drizzle";
import { getDefaultBranch, getRepoName, isGitRepository } from "../../tasks/repos";
import { detectExecutionMode } from "../../repo/execution-mode";
import { orpc } from "../base";
import { execSync } from "child_process";
import { RepoLockManager } from "../../executor/repo-lock-manager";
import { GitOperations } from "../../executor/git-operations";
import { SessionManager } from "../../executor/session-manager";

// =============================================================================
// Zod Schemas
// =============================================================================

const repoSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  defaultBranch: z.string().nullable(),
  executionMode: z.enum(["auto", "worktree", "direct"]).nullable(),
  createdAt: z.string(),
});

const taskStatsSchema = z.object({
  pending: z.number(),
  running: z.number(),
  completed: z.number(),
  failed: z.number(),
});

const repoWithStatsSchema = repoSchema.extend({
  exists: z.boolean(),
  taskStats: taskStatsSchema,
});

const githubInfoSchema = z.object({
  type: z.enum(["issue", "pr"]),
  owner: z.string(),
  repo: z.string(),
  number: z.number(),
  url: z.string(),
  repoId: z.string(), // owner/repo
});

const repoStackMarkerSchema = z.object({
  key: z.string(),
  label: z.string(),
  found: z.boolean(),
  path: z.string().optional(),
  detail: z.string().optional(),
});

const repoStackSchema = z.object({
  tags: z.array(z.string()),
  markers: z.array(repoStackMarkerSchema),
});

const repoInspectResultSchema = z.object({
  path: z.string(),
  exists: z.boolean(),
  isDirectory: z.boolean(),
  isGitRepo: z.boolean(),
  name: z.string().nullable(),
  defaultBranch: z.string().nullable(),
  remoteUrl: z.string().nullable(),
  github: z
    .object({
      host: z.string(),
      owner: z.string(),
      repo: z.string(),
      repoId: z.string(), // owner/repo
    })
    .nullable(),
  stack: repoStackSchema.nullable(),
  suggestedExecution: z
    .object({
      mode: z.enum(["worktree", "direct"]),
      reason: z.string(),
      source: z.enum(["auto", "config"]),
    })
    .nullable(),
});

const repoDetectResultSchema = z.object({
  github: githubInfoSchema,
  match: z
    .object({
      repo: repoSchema,
      confidence: z.number(),
      remoteUrl: z.string().nullable(),
      repoExists: z.boolean(),
      stack: repoStackSchema,
    })
    .nullable(),
  candidates: z.array(
    z.object({
      repo: repoSchema,
      confidence: z.number(),
    }),
  ),
});

// =============================================================================
// Helper Functions
// =============================================================================

function generateRepoId(): string {
  return `repo_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`;
}

const GITHUB_ISSUE_REGEX = /https?:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/;
const GITHUB_PR_REGEX = /https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/;

function parseGitHubUrl(text: string) {
  const issueMatch = text.match(GITHUB_ISSUE_REGEX);
  if (issueMatch) {
    const owner = issueMatch[1]!;
    const repo = issueMatch[2]!;
    const number = parseInt(issueMatch[3]!, 10);
    return {
      type: "issue" as const,
      owner,
      repo,
      number,
      url: issueMatch[0],
      repoId: `${owner}/${repo}`,
    };
  }

  const prMatch = text.match(GITHUB_PR_REGEX);
  if (prMatch) {
    const owner = prMatch[1]!;
    const repo = prMatch[2]!;
    const number = parseInt(prMatch[3]!, 10);
    return {
      type: "pr" as const,
      owner,
      repo,
      number,
      url: prMatch[0],
      repoId: `${owner}/${repo}`,
    };
  }

  return null;
}

function getRemoteUrl(repoPath: string): string | null {
  try {
    const remote = execSync("git remote get-url origin", {
      cwd: repoPath,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
    return remote || null;
  } catch {
    return null;
  }
}

function parseGitHubRemote(remoteUrl: string | null) {
  if (!remoteUrl) return null;
  // Supports:
  // - https://github.com/owner/repo(.git)
  // - git@github.com:owner/repo(.git)
  const m = remoteUrl.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (!m) return null;
  const owner = m[1]!;
  const repo = m[2]!;
  return { host: "github.com", owner, repo, repoId: `${owner}/${repo}` };
}

function scoreRepoMatch({
  githubOwner,
  githubRepo,
  repoName,
  repoPath,
  remoteUrl,
}: {
  githubOwner: string;
  githubRepo: string;
  repoName: string;
  repoPath: string;
  remoteUrl: string | null;
}) {
  const owner = githubOwner.toLowerCase();
  const repo = githubRepo.toLowerCase();
  const name = repoName.toLowerCase();
  const path = repoPath.toLowerCase();
  const remote = remoteUrl?.toLowerCase() ?? "";

  const target1 = `github.com/${owner}/${repo}`;
  const target2 = `:${owner}/${repo}`;

  if (remote && (remote.includes(target1) || remote.includes(target2))) return 1.0;
  if (name === repo) return 0.8;
  if (path.endsWith(`/${repo}`) || path.includes(`/${repo}/`)) return 0.6;
  if (path.includes(repo)) return 0.4;
  return 0;
}

function detectRepoStack(repoPath: string) {
  const repoExists = existsSync(repoPath);
  const markers: Array<z.infer<typeof repoStackMarkerSchema>> = [];
  const tags = new Set<string>();

  const safeExists = (relPath: string) =>
    repoExists ? existsSync(join(repoPath, relPath)) : false;

  let topLevel: string[] = [];
  if (repoExists) {
    try {
      topLevel = readdirSync(repoPath);
    } catch {
      topLevel = [];
    }
  }

  const hasUproject = topLevel.some((f) => f.toLowerCase().endsWith(".uproject"));
  const hasUplugin = topLevel.some((f) => f.toLowerCase().endsWith(".uplugin"));
  const hasXcodeproj = topLevel.some((f) => f.toLowerCase().endsWith(".xcodeproj"));

  const addMarker = (m: z.infer<typeof repoStackMarkerSchema>) => markers.push(m);

  addMarker({
    key: "unrealProject",
    label: "Unreal project (.uproject / DefaultEngine.ini)",
    found: hasUproject || safeExists("Config/DefaultEngine.ini") || hasUplugin,
    path: hasUproject
      ? topLevel.find((f) => f.toLowerCase().endsWith(".uproject"))
      : safeExists("Config/DefaultEngine.ini")
        ? "Config/DefaultEngine.ini"
        : hasUplugin
          ? topLevel.find((f) => f.toLowerCase().endsWith(".uplugin"))
          : undefined,
  });

  addMarker({
    key: "packageJson",
    label: "Node (package.json)",
    found: safeExists("package.json"),
    path: "package.json",
  });
  addMarker({
    key: "bunLock",
    label: "Bun (bun.lock/bun.lockb)",
    found: safeExists("bun.lock") || safeExists("bun.lockb"),
  });
  addMarker({
    key: "pnpmLock",
    label: "pnpm (pnpm-lock.yaml)",
    found: safeExists("pnpm-lock.yaml"),
    path: "pnpm-lock.yaml",
  });
  addMarker({
    key: "yarnLock",
    label: "Yarn (yarn.lock)",
    found: safeExists("yarn.lock"),
    path: "yarn.lock",
  });
  addMarker({
    key: "turbo",
    label: "Turborepo (turbo.json)",
    found: safeExists("turbo.json"),
    path: "turbo.json",
  });
  addMarker({ key: "nx", label: "Nx (nx.json)", found: safeExists("nx.json"), path: "nx.json" });
  addMarker({ key: "goMod", label: "Go (go.mod)", found: safeExists("go.mod"), path: "go.mod" });
  addMarker({
    key: "cargo",
    label: "Rust (Cargo.toml)",
    found: safeExists("Cargo.toml"),
    path: "Cargo.toml",
  });
  addMarker({
    key: "pyProject",
    label: "Python (pyproject.toml)",
    found: safeExists("pyproject.toml"),
    path: "pyproject.toml",
  });
  addMarker({
    key: "requirements",
    label: "Python (requirements.txt)",
    found: safeExists("requirements.txt"),
    path: "requirements.txt",
  });
  addMarker({
    key: "cmake",
    label: "CMake (CMakeLists.txt)",
    found: safeExists("CMakeLists.txt"),
    path: "CMakeLists.txt",
  });
  addMarker({
    key: "dockerfile",
    label: "Docker (Dockerfile)",
    found: safeExists("Dockerfile"),
    path: "Dockerfile",
  });
  addMarker({
    key: "dockerCompose",
    label: "Docker Compose (docker-compose.yml)",
    found: safeExists("docker-compose.yml") || safeExists("docker-compose.yaml"),
  });
  addMarker({
    key: "unity",
    label: "Unity (Assets/ + ProjectSettings/)",
    found: safeExists("Assets") && safeExists("ProjectSettings"),
    path: safeExists("Assets") ? "Assets/" : undefined,
  });
  addMarker({
    key: "androidGradle",
    label: "Android/Gradle (settings.gradle/build.gradle)",
    found:
      safeExists("settings.gradle") ||
      safeExists("settings.gradle.kts") ||
      safeExists("build.gradle") ||
      safeExists("build.gradle.kts"),
  });
  addMarker({
    key: "iosXcode",
    label: "iOS/Xcode (.xcodeproj/Podfile)",
    found: hasXcodeproj || safeExists("Podfile"),
    path: hasXcodeproj
      ? topLevel.find((f) => f.toLowerCase().endsWith(".xcodeproj"))
      : safeExists("Podfile")
        ? "Podfile"
        : undefined,
  });

  // Tags
  const markerMap = Object.fromEntries(markers.map((m) => [m.key, m.found] as const));
  if (markerMap.unrealProject) tags.add("unreal");
  if (markerMap.unity) tags.add("unity");
  if (markerMap.packageJson) tags.add("node");
  if (markerMap.bunLock) tags.add("bun");
  if (markerMap.pnpmLock) tags.add("pnpm");
  if (markerMap.yarnLock) tags.add("yarn");
  if (markerMap.turbo) tags.add("turborepo");
  if (markerMap.nx) tags.add("nx");
  if (markerMap.goMod) tags.add("go");
  if (markerMap.cargo) tags.add("rust");
  if (markerMap.pyProject || markerMap.requirements) tags.add("python");
  if (markerMap.cmake) tags.add("cmake");
  if (markerMap.dockerfile || markerMap.dockerCompose) tags.add("docker");

  if (markerMap.turbo || markerMap.nx || markerMap.pnpmLock || markerMap.yarnLock)
    tags.add("monorepo");

  return {
    tags: [...tags],
    markers,
  };
}

// =============================================================================
// Handlers
// =============================================================================

/**
 * List all repositories
 */
const list = orpc.output(z.array(repoSchema)).handler(async () => {
  const db = getDb();
  const repoList = db
    .select({
      id: repos.id,
      name: repos.name,
      path: repos.path,
      defaultBranch: repos.defaultBranch,
      executionMode: repos.executionMode,
      createdAt: repos.createdAt,
    })
    .from(repos)
    .orderBy(repos.name)
    .all();

  return repoList;
});

/**
 * Get single repository with path validation and task stats
 */
const get = orpc
  .input(z.object({ id: z.string() }))
  .output(repoWithStatsSchema)
  .handler(async ({ input, errors }) => {
    const db = getDb();
    const { id } = input;

    const repo = db
      .select({
        id: repos.id,
        name: repos.name,
        path: repos.path,
        defaultBranch: repos.defaultBranch,
        executionMode: repos.executionMode,
        createdAt: repos.createdAt,
      })
      .from(repos)
      .where(eq(repos.id, id))
      .get();

    if (!repo) {
      throw errors.NOT_FOUND({ message: "Repo not found", data: { resource: "repo", id } });
    }

    // Check if path still exists
    const exists = existsSync(repo.path);

    // Get task counts for this repo using Drizzle
    const taskStats = db
      .select({
        pending: sql<number>`COUNT(CASE WHEN ${tasks.status} = 'pending' THEN 1 END)`,
        running: sql<number>`COUNT(CASE WHEN ${tasks.status} = 'running' THEN 1 END)`,
        completed: sql<number>`COUNT(CASE WHEN ${tasks.status} = 'completed' THEN 1 END)`,
        failed: sql<number>`COUNT(CASE WHEN ${tasks.status} = 'failed' THEN 1 END)`,
      })
      .from(tasks)
      .where(eq(tasks.repoId, id))
      .get() ?? { pending: 0, running: 0, completed: 0, failed: 0 };

    return {
      ...repo,
      exists,
      taskStats,
    };
  });

/**
 * Add new repository
 * Validates path exists, is directory, and is git repo
 */
const add = orpc
  .input(
    z.object({
      path: z.string().min(1),
      name: z.string().optional(),
      defaultBranch: z.string().optional(),
    }),
  )
  .output(repoSchema)
  .handler(async ({ input, errors }) => {
    const db = getDb();
    const path = input.path.trim();

    // Validate path exists and is a directory
    if (!existsSync(path)) {
      throw errors.BAD_REQUEST({ message: "Path does not exist", data: { field: "path" } });
    }

    const stat = statSync(path);
    if (!stat.isDirectory()) {
      throw errors.BAD_REQUEST({ message: "Path is not a directory", data: { field: "path" } });
    }

    // Validate it's a git repository
    if (!isGitRepository(path)) {
      throw errors.BAD_REQUEST({
        message: "Path is not a git repository",
        data: { field: "path" },
      });
    }

    // Check if repo already exists
    const existing = db.select({ id: repos.id }).from(repos).where(eq(repos.path, path)).get();

    if (existing) {
      throw errors.CONFLICT({ message: "Repo already exists" });
    }

    // Auto-detect name from git remote and default branch
    const name = input.name?.trim() || getRepoName(path);
    const defaultBranch = input.defaultBranch?.trim() || getDefaultBranch(path);
    const id = generateRepoId();
    const now = new Date().toISOString();

    db.insert(repos)
      .values({
        id,
        name,
        path,
        defaultBranch,
        createdAt: now,
      })
      .run();

    const repo = db
      .select({
        id: repos.id,
        name: repos.name,
        path: repos.path,
        defaultBranch: repos.defaultBranch,
        executionMode: repos.executionMode,
        createdAt: repos.createdAt,
      })
      .from(repos)
      .where(eq(repos.id, id))
      .get();

    if (!repo) {
      throw errors.INTERNAL_SERVER_ERROR({ message: "Failed to create repo" });
    }

    return repo;
  });

/**
 * Inspect repository path (for UI previews)
 *
 * - Validates existence/directory/git repo
 * - Extracts: name, defaultBranch, remote URL, GitHub owner/repo (if origin is GitHub)
 * - Computes stack markers/tags (best-effort)
 * - Computes suggested execution mode (auto-detected)
 */
const inspect = orpc
  .input(z.object({ path: z.string().min(1) }))
  .output(repoInspectResultSchema)
  .handler(async ({ input }) => {
    const path = input.path.trim();
    const exists = existsSync(path);
    let isDirectory = false;
    if (exists) {
      try {
        isDirectory = statSync(path).isDirectory();
      } catch {
        isDirectory = false;
      }
    }
    const isGitRepo = isDirectory ? isGitRepository(path) : false;

    const remoteUrl = isGitRepo ? getRemoteUrl(path) : null;
    const github = parseGitHubRemote(remoteUrl);

    const name = isGitRepo ? getRepoName(path) : null;
    const defaultBranch = isGitRepo ? getDefaultBranch(path) : null;
    const stack = isDirectory ? detectRepoStack(path) : null;
    const suggestedExecution = isGitRepo ? await detectExecutionMode(path, "auto") : null;

    return {
      path,
      exists,
      isDirectory,
      isGitRepo,
      name,
      defaultBranch,
      remoteUrl,
      github,
      stack,
      suggestedExecution,
    };
  });

/**
 * Update repository
 * Allows updating name, defaultBranch, and executionMode
 */
const update = orpc
  .input(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      defaultBranch: z.string().optional(),
      executionMode: z.enum(["auto", "worktree", "direct"]).optional(),
    }),
  )
  .output(repoSchema)
  .handler(async ({ input, errors }) => {
    const db = getDb();
    const { id, ...updates } = input;

    const repo = db.select().from(repos).where(eq(repos.id, id)).get();
    if (!repo) {
      throw errors.NOT_FOUND({ message: "Repo not found", data: { resource: "repo", id } });
    }

    // Build update object dynamically
    const updateValues: Record<string, string> = {};

    if (updates.name) {
      updateValues.name = updates.name.trim();
    }

    if (updates.defaultBranch) {
      updateValues.defaultBranch = updates.defaultBranch.trim();
    }

    if (updates.executionMode) {
      updateValues.executionMode = updates.executionMode;
    }

    if (Object.keys(updateValues).length === 0) {
      throw errors.BAD_REQUEST({ message: "No valid updates provided" });
    }

    db.update(repos).set(updateValues).where(eq(repos.id, id)).run();

    const updatedRepo = db
      .select({
        id: repos.id,
        name: repos.name,
        path: repos.path,
        defaultBranch: repos.defaultBranch,
        executionMode: repos.executionMode,
        createdAt: repos.createdAt,
      })
      .from(repos)
      .where(eq(repos.id, id))
      .get();

    if (!updatedRepo) {
      throw errors.INTERNAL_SERVER_ERROR({ message: "Failed to update repo" });
    }

    return updatedRepo;
  });

/**
 * Remove repository
 * Blocks if active tasks exist
 */
const remove = orpc
  .input(z.object({ id: z.string() }))
  .output(z.object({ id: z.string(), deleted: z.boolean() }))
  .handler(async ({ input, errors }) => {
    const db = getDb();
    const { id } = input;

    const repo = db.select().from(repos).where(eq(repos.id, id)).get();
    if (!repo) {
      throw errors.NOT_FOUND({ message: "Repo not found", data: { resource: "repo", id } });
    }

    // Check if there are active tasks for this repo
    const activeTask = db
      .select({ id: tasks.id })
      .from(tasks)
      .where(sql`${tasks.repoId} = ${id} AND ${tasks.status} IN ('pending', 'running')`)
      .limit(1)
      .get();

    if (activeTask) {
      throw errors.CONFLICT({ message: "Cannot delete repo with active tasks" });
    }

    db.delete(repos).where(eq(repos.id, id)).run();

    return { id, deleted: true };
  });

/**
 * Get branches for a repository
 */
const getBranches = orpc
  .input(z.object({ id: z.string() }))
  .output(z.object({ branches: z.array(z.string()), currentBranch: z.string().nullable() }))
  .handler(async ({ input, errors }) => {
    const db = getDb();
    const { id } = input;

    const repo = db.select({ path: repos.path }).from(repos).where(eq(repos.id, id)).get();

    if (!repo) {
      throw errors.NOT_FOUND({ message: "Repo not found", data: { resource: "repo", id } });
    }

    // Check if path exists and is a git repo
    if (!existsSync(repo.path) || !isGitRepository(repo.path)) {
      return { branches: [], currentBranch: null };
    }

    try {
      // Get current branch
      const currentBranch = execSync("git rev-parse --abbrev-ref HEAD", {
        cwd: repo.path,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
      }).trim();

      // Get all branches (local and remote)
      const branchOutput = execSync("git branch -a", {
        cwd: repo.path,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
      });

      const branches = branchOutput
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => {
          // Remove * marker and remotes/origin/ prefix
          let branch = line.replace(/^\*?\s+/, "");
          if (branch.startsWith("remotes/origin/")) {
            branch = branch.replace("remotes/origin/", "");
          }
          return branch;
        })
        .filter((branch) => branch !== "HEAD" && !branch.includes("->"))
        // Deduplicate
        .filter((branch, index, self) => self.indexOf(branch) === index)
        .sort();

      return { branches, currentBranch };
    } catch {
      return { branches: [], currentBranch: null };
    }
  });

/**
 * Detect repo info from a GitHub URL (issue/PR)
 *
 * - Parses the URL
 * - Matches against configured repos (via git remote, name, or path heuristics)
 * - Computes a lightweight "stack" fingerprint from repo files
 */
const detect = orpc
  .input(z.object({ url: z.string().min(1) }))
  .output(repoDetectResultSchema)
  .handler(async ({ input, errors }) => {
    const github = parseGitHubUrl(input.url.trim());
    if (!github) {
      throw errors.BAD_REQUEST({ message: "Unsupported GitHub URL", data: { field: "url" } });
    }

    const db = getDb();
    const repoList = db
      .select({
        id: repos.id,
        name: repos.name,
        path: repos.path,
        defaultBranch: repos.defaultBranch,
        executionMode: repos.executionMode,
        createdAt: repos.createdAt,
      })
      .from(repos)
      .orderBy(repos.name)
      .all();

    const candidates = repoList
      .map((r) => {
        const remoteUrl = getRemoteUrl(r.path);
        const confidence = scoreRepoMatch({
          githubOwner: github.owner,
          githubRepo: github.repo,
          repoName: r.name,
          repoPath: r.path,
          remoteUrl,
        });
        return { repo: r, remoteUrl, confidence };
      })
      .filter((c) => c.confidence > 0)
      .sort((a, b) => b.confidence - a.confidence);

    const topCandidates = candidates.slice(0, 3).map((c) => ({
      repo: c.repo,
      confidence: c.confidence,
    }));

    const best = candidates[0];
    if (!best) {
      return { github, match: null, candidates: topCandidates };
    }

    const repoExists = existsSync(best.repo.path);
    const stack = detectRepoStack(best.repo.path);

    return {
      github,
      match: {
        repo: best.repo,
        confidence: best.confidence,
        remoteUrl: best.remoteUrl,
        repoExists,
        stack,
      },
      candidates: topCandidates,
    };
  });

/**
 * Check repository status for task creation validation
 * Returns lock status and git tree status
 */
const checkStatus = orpc
  .input(z.object({ id: z.string() }))
  .output(
    z.object({
      gitTreeClean: z.boolean(),
      hasExclusiveLock: z.boolean(),
      hasSharedLocks: z.boolean(),
      sharedLockHolders: z.array(z.string()),
      canCreateDirectChat: z.boolean(),
      canCreateDirectWorkflow: z.boolean(),
      blockedReason: z.string().optional(),
    })
  )
  .handler(async ({ input, errors }) => {
    const db = getDb();
    const { id } = input;

    // Get repo
    const repo = db.select().from(repos).where(eq(repos.id, id)).get();

    if (!repo) {
      throw errors.NOT_FOUND({ message: "Repo not found", data: { resource: "repo", id } });
    }

    // Check if path exists
    if (!existsSync(repo.path)) {
      throw errors.NOT_FOUND({
        message: `Repository path not found: ${repo.path}`,
        data: { resource: "repo", id },
      });
    }

    // Initialize managers
    const repoLockManager = new RepoLockManager();
    const sessionManager = new SessionManager(process.env.NIGHTSHIFT_DATA_DIR || "~/.nightshift");
    const gitOperations = new GitOperations(sessionManager);

    // Check git tree status
    let gitTreeClean = false;
    try {
      gitTreeClean = await gitOperations.isWorkingTreeClean(repo.path);
    } catch (error) {
      console.error("[repos.checkStatus] Error checking git tree:", error);
    }

    // Check lock status
    const hasExclusiveLock = await repoLockManager.hasExclusiveLock(id);
    const sharedLockHolders = await repoLockManager.getSharedLockHolders(id);
    const hasSharedLocks = sharedLockHolders.length > 0;

    // Determine what can be created
    let canCreateDirectChat = true;
    let canCreateDirectWorkflow = true;
    let blockedReason: string | undefined;

    // Direct chat: Blocked by exclusive lock only
    if (hasExclusiveLock) {
      canCreateDirectChat = false;
      blockedReason = "Repository is locked by a workflow";
    }

    // Direct workflow: Blocked by any locks or dirty tree
    if (hasExclusiveLock || hasSharedLocks) {
      canCreateDirectWorkflow = false;
      blockedReason = hasExclusiveLock
        ? "Repository is locked by another workflow"
        : `Repository is locked by ${sharedLockHolders.length} chat session(s)`;
    } else if (!gitTreeClean) {
      canCreateDirectWorkflow = false;
      blockedReason = "Working tree has uncommitted changes";
    }

    return {
      gitTreeClean,
      hasExclusiveLock,
      hasSharedLocks,
      sharedLockHolders,
      canCreateDirectChat,
      canCreateDirectWorkflow,
      blockedReason,
    };
  });

// =============================================================================
// Router Export
// =============================================================================

export const reposRouter = {
  list,
  get,
  add,
  inspect,
  update,
  remove,
  getBranches,
  detect,
  checkStatus,
};
