/**
 * Command Palette
 *
 * Quick task creation with Cmd+K.
 * Features: GitHub URL detection, repo selection, priority options.
 */

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { useCreateTask } from "@/hooks/useTasks";
import { useRepos } from "@/hooks/useRepos";
import { ChevronDown, ExternalLink, GitBranch, Loader2, Search } from "lucide-react";

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
  { value: "low", label: "Low", color: "text-[var(--color-text-muted)]" },
  {
    value: "medium",
    label: "Medium",
    color: "text-[var(--color-text-secondary)]",
  },
  { value: "high", label: "High", color: "text-[var(--color-warning)]" },
  {
    value: "urgent",
    label: "Urgent",
    color: "text-[var(--color-destructive)]",
  },
];

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [value, setValue] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [selectedRepoId, setSelectedRepoId] = useState<string | undefined>();
  const [branch, setBranch] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);
  const [showRepoDropdown, setShowRepoDropdown] = useState(false);

  const { addToast } = useToast();
  const createTask = useCreateTask();
  const { data: reposData } = useRepos();
  const repos = reposData ?? [];

  // Parse GitHub URL from input
  const githubInfo = useMemo(() => parseGitHubUrl(value), [value]);

  // Auto-select repo if GitHub URL matches a configured repo
  useEffect(() => {
    if (githubInfo && repos.length > 0) {
      const matchingRepo = repos.find((r) =>
        r.path.toLowerCase().includes(githubInfo.repo.toLowerCase()),
      );
      if (matchingRepo) {
        setSelectedRepoId(matchingRepo.id);
      }
    }
  }, [
	githubInfo,
	repos.length,
	repos
]);

  // Reset state when closing
  useEffect(() => {
    if (!open) {
      setValue("");
      setPriority("medium");
      setSelectedRepoId(undefined);
      setBranch("");
      setShowAdvanced(false);
      setShowPriorityDropdown(false);
      setShowRepoDropdown(false);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim() || createTask.isPending) return;

    try {
      await createTask.mutateAsync({
        prompt: value.trim(),
        repoId: selectedRepoId,
        priority,
        githubIssueUrl: githubInfo?.url,
        branch: branch || undefined,
      });

      addToast({
        title: "Task queued",
        description: value.length > 50 ? value.substring(0, 50) + "..." : value,
        variant: "success",
      });

      onClose();
    } catch (error) {
      addToast({
        title: "Failed to create task",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "error",
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      if (showPriorityDropdown || showRepoDropdown) {
        setShowPriorityDropdown(false);
        setShowRepoDropdown(false);
      } else {
        onClose();
      }
    }
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      setShowAdvanced(true);
    }
  };

  const selectedPriority = priorityOptions.find((p) => p.value === priority)!;
  const selectedRepo = repos.find((r) => r.id === selectedRepoId);

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent className="w-[560px] max-w-[90vw] p-0">
        <form onSubmit={handleSubmit}>
          {/* Main input */}
          <div className="flex items-center border-b border-[var(--color-border)] px-4">
            <Search className="h-5 w-5 text-[var(--color-text-muted)]" />
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a task or paste a GitHub URL..."
              className="flex-1 bg-transparent px-3 py-4 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
              autoFocus
              disabled={createTask.isPending}
            />
            {createTask.isPending && (
              <Loader2 className="h-4 w-4 animate-spin text-[var(--color-accent)]" />
            )}
          </div>

          {/* GitHub URL Preview */}
          {githubInfo && (
            <div className="border-b border-[var(--color-border)] px-4 py-3">
              <div className="flex items-center gap-2 text-sm">
                <GitBranch className="h-4 w-4 text-[var(--color-text-muted)]" />
                <span className="text-[var(--color-text-secondary)]">
                  {githubInfo.owner}/{githubInfo.repo}
                </span>
                <span className="text-[var(--color-accent)]">#{githubInfo.number}</span>
                <span className="rounded bg-[var(--color-surface-hover)] px-1.5 py-0.5 text-xs text-[var(--color-text-muted)]">
                  {githubInfo.type === "issue" ? "Issue" : "PR"}
                </span>
                <a
                  href={githubInfo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          )}

          {/* Options row */}
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2">
            {/* Priority selector */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowPriorityDropdown(!showPriorityDropdown);
                  setShowRepoDropdown(false);
                }}
                className="flex items-center gap-1.5 rounded-[var(--radius-md)] px-2 py-1 text-sm hover:bg-[var(--color-surface-hover)]"
              >
                <span className={selectedPriority.color}>{selectedPriority.label}</span>
                <ChevronDown className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
              </button>
              {showPriorityDropdown && (
                <div className="absolute left-0 top-full z-10 mt-1 w-32 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-lg">
                  {priorityOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setPriority(opt.value);
                        setShowPriorityDropdown(false);
                      }}
                      className={`flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-[var(--color-surface-hover)] ${opt.color}`}
                    >
                      {opt.label}
                      {opt.value === "urgent" && (
                        <span className="ml-auto rounded bg-[var(--color-destructive)] px-1 text-xs text-white">
                          !
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Repo selector */}
            {repos.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setShowRepoDropdown(!showRepoDropdown);
                    setShowPriorityDropdown(false);
                  }}
                  className="flex items-center gap-1.5 rounded-[var(--radius-md)] px-2 py-1 text-sm hover:bg-[var(--color-surface-hover)]"
                >
                  <span className="text-[var(--color-text-secondary)]">
                    {selectedRepo ? selectedRepo.name : "No repo"}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
                </button>
                {showRepoDropdown && (
                  <div className="absolute left-0 top-full z-10 mt-1 max-h-48 w-48 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-lg">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRepoId(undefined);
                        setShowRepoDropdown(false);
                      }}
                      className="flex w-full items-center px-3 py-1.5 text-left text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
                    >
                      No repo
                    </button>
                    {repos.map((repo) => (
                      <button
                        key={repo.id}
                        type="button"
                        onClick={() => {
                          setSelectedRepoId(repo.id);
                          setShowRepoDropdown(false);
                        }}
                        className="flex w-full items-center px-3 py-1.5 text-left text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
                      >
                        {repo.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Advanced toggle */}
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="ml-auto text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            >
              {showAdvanced ? "Hide options" : "More options"}
            </button>
          </div>

          {/* Advanced options */}
          {showAdvanced && (
            <div className="border-b border-[var(--color-border)] px-4 py-3">
              <label className="block text-xs text-[var(--color-text-muted)]">Branch</label>
              <input
                type="text"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder={selectedRepo?.defaultBranch || "main"}
                className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
              />
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between p-4">
            <p className="text-xs text-[var(--color-text-muted)]">
              <kbd className="rounded bg-[var(--color-surface-hover)] px-1">Enter</kbd> create
              <span className="mx-2">·</span>
              <kbd className="rounded bg-[var(--color-surface-hover)] px-1">Tab</kbd> options
              <span className="mx-2">·</span>
              <kbd className="rounded bg-[var(--color-surface-hover)] px-1">Esc</kbd> close
            </p>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
