/**
 * API Client
 *
 * Fetch wrapper for local daemon API.
 */

const API_BASE = "/api";

interface ApiSuccess<T> {
  ok: true;
  data: T;
}

interface ApiError {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    retryable?: boolean;
  };
}

type ApiResponse<T> = ApiSuccess<T> | ApiError;

/**
 * Fetch from the API with proper error handling
 */
async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });

  const json = (await response.json()) as ApiResponse<T>;

  if (!json.ok) {
    throw new Error(json.error.message);
  }

  return json.data;
}

// Types
export interface DaemonStatus {
  running: boolean;
  version: string;
  mode: "standalone" | "connected" | "hybrid";
  port: number;
  uptime: number;
  database: {
    schemaVersion: number;
    tables: string[];
  };
  activeTask: {
    id: number;
    prompt: string;
    repoPath: string | null;
    startedAt: string;
    elapsedMs: number;
  } | null;
  stats: {
    pending: number;
    running: number;
    paused: number;
    completed: number;
    failed: number;
    repoCount: number;
  };
}

export interface Task {
  id: number;
  prompt: string;
  repoId: number | null;
  repoPath: string | null;
  priority: string;
  status: string;
  failureCode: string | null;
  needsHumanCode: string | null;
  needsHumanQuestion: string | null;
  githubIssueUrl: string | null;
  branch: string | null;
  prUrl: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  // Worktree/pause fields
  executionMode: "worktree" | "direct" | null;
  workDir: string | null;
  baseCommitSha: string | null;
  originalBranch: string | null;
  pausedAt: string | null;
  pauseReason: "manual" | "needs_human" | "rate_limit" | null;
  humanQuestion: string | null;
  humanResponse: string | null;
}

export interface DiffStats {
  content: string;
  added: number;
  removed: number;
  files: string[];
}

export interface Repo {
  id: string;
  name: string;
  path: string;
  defaultBranch: string;
  createdAt: string;
}

export interface Config {
  port: number;
  taskTimeoutMs: number;
  localQueueEnabled: boolean;
  serverUrl: string | null;
  maxConcurrentTasks: number;
  scheduleStart: string | null;
  scheduleEnd: string | null;
}

// API Functions
export const api = {
  // Status
  getStatus: () => fetchApi<DaemonStatus>("/status"),

  // Tasks
  getTasks: (params?: { status?: string; limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set("status", params.status);
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.offset) searchParams.set("offset", String(params.offset));
    const query = searchParams.toString();
    return fetchApi<{
      tasks: Task[];
      pagination: { total: number; limit: number; offset: number };
    }>(`/tasks${query ? `?${query}` : ""}`);
  },

  getTask: (id: number) => fetchApi<Task & { session: unknown | null }>(`/tasks/${id}`),

  createTask: (data: {
    prompt: string;
    repoId?: number;
    priority?: string;
    githubIssueUrl?: string;
    branch?: string;
  }) =>
    fetchApi<Task>("/tasks", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateTask: (id: number, data: { status?: string; priority?: string }) =>
    fetchApi<Task>(`/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  cancelTask: (id: number) =>
    fetchApi<{ id: number; status: string }>(`/tasks/${id}`, {
      method: "DELETE",
    }),

  pauseTask: (id: number, reason?: "manual") =>
    fetchApi<Task>(`/tasks/${id}/pause`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),

  resumeTask: (id: number, response?: string) =>
    fetchApi<Task>(`/tasks/${id}/resume`, {
      method: "POST",
      body: JSON.stringify({ response }),
    }),

  getTaskDiff: (id: number) => fetchApi<DiffStats>(`/tasks/${id}/diff`),

  // Repos
  getRepos: () => fetchApi<Repo[]>("/repos"),

  getRepo: (id: string) =>
    fetchApi<
      Repo & {
        exists: boolean;
        taskStats: {
          pending: number;
          running: number;
          completed: number;
          failed: number;
        };
      }
    >(`/repos/${id}`),

  addRepo: (data: { path: string; name?: string; defaultBranch?: string }) =>
    fetchApi<Repo>("/repos", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deleteRepo: (id: string) =>
    fetchApi<{ id: string; deleted: boolean }>(`/repos/${id}`, {
      method: "DELETE",
    }),

  // Config
  getConfig: () => fetchApi<Config>("/config"),

  updateConfig: (data: Partial<Config>) =>
    fetchApi<Config>("/config", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  // Update
  getUpdateStatus: () =>
    fetchApi<{
      currentVersion: string;
      updateAvailable: boolean;
      availableVersion: string | null;
      downloadUrl: string | null;
      releaseNotes: string | null;
      publishedAt: string | null;
      lastCheckAt: string | null;
      canUpdate: boolean;
    }>("/update/status"),

  checkForUpdates: () =>
    fetchApi<{
      currentVersion: string;
      updateAvailable: boolean;
      availableVersion: string | null;
      downloadUrl: string | null;
      releaseNotes: string | null;
      publishedAt: string | null;
      lastCheckAt: string | null;
    }>("/update/check", { method: "POST" }),

  downloadUpdate: () =>
    fetchApi<{
      downloaded: boolean;
      filePath: string;
      version: string;
    }>("/update/download", { method: "POST" }),

  installUpdate: () =>
    fetchApi<{
      installed: boolean;
      version: string;
      restarting: boolean;
    }>("/update/install", { method: "POST" }),
};
