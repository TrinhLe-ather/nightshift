/**
 * Command Palette
 *
 * Quick task creation with Cmd+K.
 * Features: GitHub URL detection, repo selection, priority options, branch selection.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useCreateTask } from "@/hooks/useTasks";
import { useRepos } from "@/hooks/useRepos";
import { useDetectRepoFromGithub, type RepoDetectResult } from "@/web/hooks/useRepoDetection";
import { ChevronDown, ExternalLink, GitBranch, Loader2, Search } from "@/components/ui/icons";
import { toast } from "sonner";
import { client } from "@/web/integrations/orpc";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

type Priority = "low" | "medium" | "high" | "urgent";

interface GitHubInfo {
  type: "issue" | "pr";
  owner: string;
  repo: string;
  number: number;
  url: string;
}

const GITHUB_ISSUE_REGEX = /https?:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/;
const GITHUB_PR_REGEX = /https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/;

function parseGitHubUrl(text: string): GitHubInfo | null {
  const issueMatch = text.match(GITHUB_ISSUE_REGEX);
  if (issueMatch) {
    return {
      type: "issue",
      owner: issueMatch[1]!,
      repo: issueMatch[2]!,
      number: parseInt(issueMatch[3]!, 10),
      url: issueMatch[0],
    };
  }

  const prMatch = text.match(GITHUB_PR_REGEX);
  if (prMatch) {
    return {
      type: "pr",
      owner: prMatch[1]!,
      repo: prMatch[2]!,
      number: parseInt(prMatch[3]!, 10),
      url: prMatch[0],
    };
  }

  return null;
}

const priorityOptions: { value: Priority; label: string; color: string }[] = [
  { value: "low", label: "Low", color: "text-muted-foreground/70" },
  {
    value: "medium",
    label: "Medium",
    color: "text-foreground",
  },
  { value: "high", label: "High", color: "text-amber-600 dark:text-amber-400" },
  {
    value: "urgent",
    label: "Urgent",
    color: "text-destructive",
  },
];

// Stable empty array to prevent re-renders
const EMPTY_REPOS: never[] = [];

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [value, setValue] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [selectedRepoId, setSelectedRepoId] = useState<string | undefined>();
  const [branch, setBranch] = useState("");
  const [autoYes, setAutoYes] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);
  const [showRepoDropdown, setShowRepoDropdown] = useState(false);
  const [showBranchDropdown, setShowBranchDropdown] = useState(false);
  const [detection, setDetection] = useState<RepoDetectResult | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [currentBranch, setCurrentBranch] = useState<string | null>(null);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);

  const createTask = useCreateTask();
  const { data: reposData } = useRepos();
  const detectRepoMutation = useDetectRepoFromGithub();
  const lastDetectedUrlRef = useRef<string | null>(null);

  // Memoize repos to ensure stable reference
  const repos = useMemo(() => reposData ?? EMPTY_REPOS, [reposData]);

  // Store mutation functions in refs to keep them stable
  const detectRepoRef = useRef(detectRepoMutation.mutateAsync);
  detectRepoRef.current = detectRepoMutation.mutateAsync;

  // Parse GitHub URL from input
  const githubInfo = useMemo(() => parseGitHubUrl(value), [value]);

  // Load branches when repo is selected (only for worktree repos)
  useEffect(() => {
    if (!selectedRepoId || !open) {
      setBranches([]);
      setCurrentBranch(null);
      setBranch("");
      return;
    }

    const selectedRepo = repos.find((r) => r.id === selectedRepoId);
    if (!selectedRepo) return;

    // Only load branches for worktree repos
    if (selectedRepo.executionMode !== "worktree") {
      setBranches([]);
      setCurrentBranch(null);
      setBranch("");
      return;
    }

    setIsLoadingBranches(true);
    client.repos
      .getBranches({ id: selectedRepoId })
      .then((result) => {
        setBranches(result.branches);
        setCurrentBranch(result.currentBranch);
        // Auto-select current branch if available
        if (result.currentBranch) {
          setBranch(result.currentBranch);
        }
      })
      .catch((err) => {
        console.error("Failed to load branches:", err);
        setBranches([]);
        setCurrentBranch(null);
      })
      .finally(() => {
        setIsLoadingBranches(false);
      });
  }, [selectedRepoId, open, repos]);

  // Debounced repo detection for GitHub URLs (issue/PR)
  useEffect(() => {
    if (!githubInfo || !open) {
      setDetection(null);
      setIsDetecting(false);
      lastDetectedUrlRef.current = null;
      return;
    }

    // Debounce: wait briefly for user to finish pasting/typing
    const url = githubInfo.url;
    const t = setTimeout(async () => {
      if (lastDetectedUrlRef.current === url) return;
      lastDetectedUrlRef.current = url;
      setIsDetecting(true);
      try {
        // Use ref to access stable mutation function
        const result = await detectRepoRef.current({ url });
        setDetection(result);
        if (result.match?.repo?.id) {
          setSelectedRepoId(result.match.repo.id);
        }
      } catch {
        // keep detection UI quiet; creation flow still works without detection
        setDetection(null);
      } finally {
        setIsDetecting(false);
      }
    }, 400);

    return () => clearTimeout(t);
  }, [githubInfo, open]);

  // Reset state when closing
  useEffect(() => {
    if (!open) {
      setValue("");
      setPriority("medium");
      setSelectedRepoId(undefined);
      setBranch("");
      setAutoYes(false);
      setShowAdvanced(false);
      setShowPriorityDropdown(false);
      setShowRepoDropdown(false);
      setShowBranchDropdown(false);
      setDetection(null);
      setIsDetecting(false);
      setBranches([]);
      setCurrentBranch(null);
      lastDetectedUrlRef.current = null;
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim() || createTask.isPending) return;

    // Validate repo is selected
    if (!selectedRepoId) {
      toast.error("Repo is required", {
        description: "Please select a repository for this task",
      });
      return;
    }

    try {
      await createTask.mutateAsync({
        prompt: value.trim(),
        repoId: selectedRepoId,
        priority,
        githubIssueUrl: githubInfo?.url,
        branch: branch || undefined,
        autoYes,
      });

      toast.success("Task queued", {
        description: value.length > 50 ? value.substring(0, 50) + "..." : value,
      });

      onClose();
    } catch (error) {
      toast.error("Failed to create task", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Don't close dialog on Escape if we're just closing dropdowns
    if (e.key === "Escape") {
      if (showPriorityDropdown || showRepoDropdown || showBranchDropdown) {
        setShowPriorityDropdown(false);
        setShowRepoDropdown(false);
        setShowBranchDropdown(false);
      } else {
        onClose();
      }
    }
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      setShowAdvanced(true);
    }
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Ctrl+Enter or Cmd+Enter
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const selectedPriority = priorityOptions.find((p) => p.value === priority)!;
  const selectedRepo = repos.find((r) => r.id === selectedRepoId);
  const isWorktreeRepo = selectedRepo?.executionMode === "worktree";

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent className="w-[720px] max-w-[calc(100vw-2rem)] p-0 sm:max-w-[720px]">
        <form onSubmit={handleSubmit}>
          {/* Main input - Textarea for multiline */}
          <div className="flex items-start border-b border-border px-4 pt-4">
            <Search className="mt-1 h-5 w-5 text-muted-foreground" />
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                handleKeyDown(e);
                handleTextareaKeyDown(e);
              }}
              placeholder="Type a task or paste a GitHub URL..."
              className="max-h-48 min-h-10 flex-1 resize-none bg-transparent px-3 pt-1 mb-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              rows={1}
              autoFocus
              disabled={createTask.isPending}
              style={{
                height: "auto",
                overflow: value.split("\n").length > 6 ? "auto" : "hidden",
              }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "auto";
                target.style.height = `${Math.min(target.scrollHeight, 192)}px`;
              }}
            />
            {createTask.isPending && <Loader2 className="mt-1 h-4 w-4 animate-spin text-primary" />}
          </div>

          {/* GitHub URL Preview */}
          {githubInfo && (
            <div className="border-b border-border px-4 py-3">
              <div className="flex items-center gap-2 text-sm">
                <GitBranch className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">
                  {githubInfo.owner}/{githubInfo.repo}
                </span>
                <span className="text-primary">#{githubInfo.number}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                  {githubInfo.type === "issue" ? "Issue" : "PR"}
                </span>
                <a
                  href={githubInfo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto text-muted-foreground hover:text-foreground"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>

              {/* Detection (read-only) */}
              <div className="mt-3 rounded-md border border-border bg-muted/30 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-foreground">Repo detection</p>
                  {isDetecting && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Detecting…
                    </div>
                  )}
                </div>

                <div className="mt-2 grid gap-2 text-xs">
                  <div className="grid grid-cols-[140px_1fr] gap-2">
                    <span className="text-muted-foreground">GitHub repo id</span>
                    <span className="text-foreground">
                      {githubInfo.owner}/{githubInfo.repo}
                    </span>
                  </div>

                  <div className="grid grid-cols-[140px_1fr] gap-2">
                    <span className="text-muted-foreground">Matched local repo</span>
                    <span className="text-foreground">
                      {detection?.match ? (
                        <>
                          {detection.match.repo.name}{" "}
                          <span className="text-muted-foreground">({detection.match.repo.id})</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </span>
                  </div>

                  <div className="grid grid-cols-[140px_1fr] gap-2">
                    <span className="text-muted-foreground">Repo stack</span>
                    <div className="flex flex-wrap gap-1.5">
                      {detection?.match?.stack?.tags?.length ? (
                        detection.match.stack.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded bg-background px-1.5 py-0.5 text-[11px] text-foreground ring-1 ring-border"
                          >
                            {tag}
                          </span>
                        ))
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>

                  <div className="mt-1 overflow-hidden rounded-md border border-border bg-background">
                    <div className="grid grid-cols-[1fr_72px] gap-0 border-b border-border bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground">
                      <span>Marker</span>
                      <span className="text-right">Found</span>
                    </div>
                    <div className="max-h-40 overflow-y-auto">
                      {(detection?.match?.stack?.markers ?? []).length ? (
                        detection!.match!.stack.markers.map((m) => (
                          <div
                            key={m.key}
                            className="grid grid-cols-[1fr_72px] gap-0 px-2 py-1 text-[11px] text-foreground"
                          >
                            <span className="truncate">
                              {m.label}
                              {m.path ? (
                                <span className="text-muted-foreground"> — {m.path}</span>
                              ) : null}
                            </span>
                            <span
                              className={`text-right ${m.found ? "text-primary" : "text-muted-foreground"}`}
                            >
                              {m.found ? "Yes" : "No"}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="px-2 py-2 text-[11px] text-muted-foreground">
                          {isDetecting ? "Detecting…" : "No detection data"}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Options row */}
          <div className="flex items-center gap-2 border-b border-border px-4 py-2">
            {/* Repo selector (Required) */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowRepoDropdown(!showRepoDropdown);
                  setShowPriorityDropdown(false);
                  setShowBranchDropdown(false);
                }}
                className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-sm hover:bg-muted ${!selectedRepo ? "ring-1 ring-destructive/50" : ""}`}
              >
                <span className={selectedRepo ? "text-foreground" : "text-destructive"}>
                  {selectedRepo ? selectedRepo.name : "Select repo *"}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              {showRepoDropdown && (
                <div className="absolute left-0 top-full z-10 mt-1 max-h-48 w-48 overflow-y-auto rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-lg">
                  {repos.map((repo) => (
                    <button
                      key={repo.id}
                      type="button"
                      onClick={() => {
                        setSelectedRepoId(repo.id);
                        setShowRepoDropdown(false);
                      }}
                      className="flex w-full items-center px-3 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                    >
                      {repo.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Priority selector */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowPriorityDropdown(!showPriorityDropdown);
                  setShowRepoDropdown(false);
                  setShowBranchDropdown(false);
                }}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm hover:bg-muted"
              >
                <span className={selectedPriority.color}>{selectedPriority.label}</span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              {showPriorityDropdown && (
                <div className="absolute left-0 top-full z-10 mt-1 w-32 rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-lg">
                  {priorityOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setPriority(opt.value);
                        setShowPriorityDropdown(false);
                      }}
                      className={`flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-muted ${opt.color}`}
                    >
                      {opt.label}
                      {opt.value === "urgent" && (
                        <span className="ml-auto rounded bg-destructive px-1 text-xs text-destructive-foreground">
                          !
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Advanced toggle */}
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground"
            >
              {showAdvanced ? "Hide options" : "More options"}
            </button>
          </div>

          {/* Advanced options */}
          {showAdvanced && (
            <div className="border-b border-border px-4 py-3 space-y-3">
              {/* Branch selector (only for worktree repos) */}
              {isWorktreeRepo && (
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">
                    Start Branch {isLoadingBranches && "(loading...)"}
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setShowBranchDropdown(!showBranchDropdown);
                        setShowPriorityDropdown(false);
                        setShowRepoDropdown(false);
                      }}
                      disabled={isLoadingBranches || branches.length === 0}
                      className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span>
                        {branch || currentBranch || selectedRepo?.defaultBranch || "main"}
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    {showBranchDropdown && branches.length > 0 && (
                      <div className="absolute left-0 top-full z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-lg">
                        {branches.map((b) => (
                          <button
                            key={b}
                            type="button"
                            onClick={() => {
                              setBranch(b);
                              setShowBranchDropdown(false);
                            }}
                            className="flex w-full items-center px-3 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                          >
                            {b}
                            {b === currentBranch && (
                              <span className="ml-auto text-xs text-muted-foreground">
                                (current)
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Auto-yes checkbox */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="autoYes"
                  checked={autoYes}
                  onChange={(e) => setAutoYes(e.target.checked)}
                  className="h-4 w-4 rounded border-input bg-background text-primary focus:ring-2 focus:ring-ring"
                />
                <label htmlFor="autoYes" className="text-xs text-foreground cursor-pointer">
                  Auto-accept all prompts (auto-yes mode)
                </label>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between p-4">
            <p className="text-xs text-muted-foreground">
              <kbd className="rounded bg-muted px-1">Ctrl+Enter</kbd> create
              <span className="mx-2">·</span>
              <kbd className="rounded bg-muted px-1">Tab</kbd> options
              <span className="mx-2">·</span>
              <kbd className="rounded bg-muted px-1">Esc</kbd> close
            </p>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
