/**
 * Repos Page
 *
 * Repository management with technical blueprint aesthetic.
 * Features visual repo cards with execution mode indicators and branch info.
 *
 * Design: Technical blueprint with precision engineering vibes.
 */

import { useState } from "react";
import {
  useDeleteRepo,
  useRepoBranches,
  useRepos,
  useUpdateRepo,
} from "@/hooks/useRepos";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AddRepoDialog } from "@/components";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  FileEdit,
  Folder,
  GitBranch,
  Loader2,
  Plus,
  Trash2,
  Clock,
  Settings,
  Search,
} from "@/components/ui/icons";
import { Container } from "@/components/layout/Container";
import { cn } from "@/lib/utils";

// Execution mode styling
function getExecutionModeStyle(mode: string | null): {
  color: string;
  bgColor: string;
  borderColor: string;
  label: string;
} {
  switch (mode) {
    case "worktree":
      return {
        color: "text-violet-400",
        bgColor: "bg-violet-500/10",
        borderColor: "border-violet-500/30",
        label: "Worktree",
      };
    case "direct":
      return {
        color: "text-amber-400",
        bgColor: "bg-amber-500/10",
        borderColor: "border-amber-500/30",
        label: "Direct",
      };
    default:
      return {
        color: "text-emerald-400",
        bgColor: "bg-emerald-500/10",
        borderColor: "border-emerald-500/30",
        label: "Auto",
      };
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays < 1) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

interface RepoCardProps {
  repo: {
    id: string;
    name: string;
    path: string;
    defaultBranch: string | null;
    executionMode: "auto" | "worktree" | "direct" | null;
    createdAt: string;
  };
  index: number;
  onEdit: () => void;
  onDelete: () => void;
}

function RepoCard({ repo, index, onEdit, onDelete }: RepoCardProps) {
  const modeStyle = getExecutionModeStyle(repo.executionMode);

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-lg border bg-card transition-all duration-300",
        "hover:border-primary/50 hover:shadow-[0_0_20px_rgba(var(--primary),0.1)]",
        "animate-in fade-in slide-in-from-bottom-2",
        "border-border",
      )}
      style={{ animationDelay: `${index * 50}ms`, animationFillMode: "both" }}
    >
      {/* Grid pattern background */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.02]">
        <div
          className="h-full w-full"
          style={{
            backgroundImage:
              "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
            backgroundSize: "16px 16px",
          }}
        />
      </div>

      {/* Left mode indicator strip */}
      <div className={cn("absolute left-0 top-0 h-full w-1", modeStyle.bgColor)} />

      {/* Header */}
      <div className="relative border-b border-border/50 p-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded border",
                  modeStyle.bgColor,
                  modeStyle.borderColor,
                )}
              >
                <Folder className={cn("h-3.5 w-3.5", modeStyle.color)} />
              </div>
              <h3 className="truncate text-sm font-medium text-foreground">{repo.name}</h3>
            </div>
            <p className="mt-2 truncate font-mono text-xs text-muted-foreground">{repo.path}</p>
          </div>

          {/* Quick actions - visible on hover */}
          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              title="Edit"
            >
              <FileEdit className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              title="Remove"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="relative flex items-center justify-between gap-2 p-4 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="rounded border-border bg-muted/30 px-1.5 py-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
          >
            <GitBranch className="mr-1 h-3 w-3" />
            {repo.defaultBranch}
          </Badge>
          <Badge
            variant="outline"
            className={cn(
              "rounded border px-1.5 py-0 text-[10px] uppercase tracking-wider",
              modeStyle.bgColor,
              modeStyle.borderColor,
              modeStyle.color,
            )}
          >
            {modeStyle.label}
          </Badge>
        </div>

        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>{formatDate(repo.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}

export function Repos() {
  const { data: repos, isLoading } = useRepos();
  const updateRepoMutation = useUpdateRepo();
  const deleteRepoMutation = useDeleteRepo();

  const [searchQuery, setSearchQuery] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [repoToDelete, setRepoToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [repoToEdit, setRepoToEdit] = useState<{
    id: string;
    name: string;
    path: string;
    defaultBranch: string | null;
    executionMode: "auto" | "worktree" | "direct" | null;
  } | null>(null);

  const [editName, setEditName] = useState("");
  const [editDefaultBranch, setEditDefaultBranch] = useState("");
  const [editExecutionMode, setEditExecutionMode] = useState<"auto" | "worktree" | "direct">(
    "auto",
  );

  // Filter repos by search
  const filteredRepos = repos?.filter(
    (repo) =>
      searchQuery === "" ||
      repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      repo.path.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const closeEditDialog = () => {
    setEditDialogOpen(false);
    setRepoToEdit(null);
    setEditName("");
    setEditDefaultBranch("");
    setEditExecutionMode("auto");
  };

  const closeDeleteDialog = () => {
    setDeleteDialogOpen(false);
    setRepoToDelete(null);
  };

  const openEditDialog = (repo: {
    id: string;
    name: string;
    path: string;
    defaultBranch: string | null;
    executionMode: "auto" | "worktree" | "direct" | null;
  }) => {
    setRepoToEdit(repo);
    setEditName(repo.name);
    setEditDefaultBranch(repo.defaultBranch ?? "");
    setEditExecutionMode(repo.executionMode ?? "auto");
    setEditDialogOpen(true);
  };

  // Fetch branches when editing a repo
  const { data: branchesData, isLoading: branchesLoading } = useRepoBranches(
    editDialogOpen ? (repoToEdit?.id ?? null) : null,
  );

  const handleEditRepo = async () => {
    if (!repoToEdit) return;
    if (!editDefaultBranch.trim()) {
      toast.error("Default branch is required");
      return;
    }

    try {
      const repo = await updateRepoMutation.mutateAsync({
        id: repoToEdit.id,
        name: editName.trim() || undefined,
        defaultBranch: editDefaultBranch.trim(),
        executionMode: editExecutionMode,
      });
      toast.success("Repository updated", {
        description: `${repo.name} settings saved.`,
      });
      closeEditDialog();
    } catch (err) {
      toast.error("Failed to update repository", {
        description: err instanceof Error ? err.message : "An error occurred",
      });
    }
  };

  const handleDeleteRepo = async () => {
    if (!repoToDelete) return;

    try {
      await deleteRepoMutation.mutateAsync(repoToDelete.id);
      toast.success("Repository removed", {
        description: `${repoToDelete.name} has been removed from configuration.`,
      });
      closeDeleteDialog();
    } catch (err) {
      toast.error("Failed to remove repository", {
        description: err instanceof Error ? err.message : "An error occurred",
      });
    }
  };

  const openDeleteDialog = (id: string, name: string) => {
    setRepoToDelete({ id, name });
    setDeleteDialogOpen(true);
  };

  return (
    <Container className="py-6 lg:py-8">
      {/* Header with technical aesthetic */}
      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
                <Folder className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-foreground">
                  Repositories
                </h1>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Configure repositories for task execution
                </p>
              </div>
            </div>
          </div>
          <Button onClick={() => setAddDialogOpen(true)} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            <span>Add Repo</span>
          </Button>
        </div>

        {/* Stats bar */}
        <div className="mt-6 flex items-center gap-6 border-y border-border/50 py-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Total:</span>
            <span className="font-medium text-foreground">{repos?.length ?? 0}</span>
          </div>
          <div className="h-3 w-px bg-border" />
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Worktree:</span>
            <span className="font-medium text-violet-400">
              {repos?.filter((r) => r.executionMode === "worktree").length ?? 0}
            </span>
          </div>
          <div className="h-3 w-px bg-border" />
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Direct:</span>
            <span className="font-medium text-amber-400">
              {repos?.filter((r) => r.executionMode === "direct").length ?? 0}
            </span>
          </div>
          <div className="h-3 w-px bg-border" />
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Auto:</span>
            <span className="font-medium text-emerald-400">
              {repos?.filter((r) => !r.executionMode || r.executionMode === "auto").length ?? 0}
            </span>
          </div>
        </div>
      </div>

      {/* Search */}
      {repos && repos.length > 0 && (
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search repositories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 bg-card pl-10 text-sm"
            />
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="relative">
            <div className="h-12 w-12 rounded-full border-2 border-border" />
            <div className="absolute inset-0 h-12 w-12 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">Loading repositories...</p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && (!repos || repos.length === 0) && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 py-20">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-muted/50">
            <Folder className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="mt-4 text-sm font-medium text-foreground">No repositories configured</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add a repository to start executing tasks
          </p>
          <Button className="mt-6" size="sm" onClick={() => setAddDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Your First Repository
          </Button>
        </div>
      )}

      {/* No search results */}
      {!isLoading && repos && repos.length > 0 && filteredRepos?.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 py-20">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-muted/50">
            <Search className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="mt-4 text-sm font-medium text-foreground">No matching repositories</p>
          <p className="mt-1 text-xs text-muted-foreground">Try adjusting your search query</p>
          <Button
            variant="outline"
            className="mt-6"
            size="sm"
            onClick={() => setSearchQuery("")}
          >
            Clear search
          </Button>
        </div>
      )}

      {/* Repos Grid */}
      {!isLoading && filteredRepos && filteredRepos.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredRepos.map((repo, index) => (
            <RepoCard
              key={repo.id}
              repo={repo}
              index={index}
              onEdit={() => openEditDialog(repo)}
              onDelete={() => openDeleteDialog(repo.id, repo.name)}
            />
          ))}
        </div>
      )}

      {/* Add Repo Dialog */}
      <AddRepoDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} />

      {/* Edit Repo Dialog */}
      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) closeEditDialog();
        }}
      >
        <DialogContent className="w-3xl md:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              Edit Repository
            </DialogTitle>
            <DialogDescription>
              Configure execution settings for this repository.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            {/* Repository info */}
            <div className="rounded-lg border border-border/50 bg-muted/20 p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Repository
              </p>
              <p className="mt-1 font-medium text-foreground">{repoToEdit?.name}</p>
              <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                {repoToEdit?.path}
              </p>
            </div>

            {/* Name */}
            <div>
              <label
                htmlFor="edit-name"
                className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted-foreground"
              >
                Display Name
              </label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="my-repo"
                className="bg-card"
              />
            </div>

            {/* Default branch */}
            <div>
              <label
                htmlFor="edit-default-branch"
                className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted-foreground"
              >
                Default Branch
              </label>
              {branchesLoading ? (
                <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading branches...
                </div>
              ) : branchesData && branchesData.branches.length > 0 ? (
                <Select
                  value={editDefaultBranch}
                  onValueChange={(v) => setEditDefaultBranch(v ?? "")}
                >
                  <SelectTrigger className="w-full bg-card">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {branchesData.branches.map((branch) => (
                      <SelectItem key={branch} value={branch}>
                        <span className="flex items-center gap-2">
                          <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{branch}</span>
                          {branch === branchesData.currentBranch && (
                            <Badge
                              variant="outline"
                              className="ml-1 rounded border-primary/30 bg-primary/10 px-1 text-[10px] text-primary"
                            >
                              current
                            </Badge>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="edit-default-branch"
                  value={editDefaultBranch}
                  onChange={(e) => setEditDefaultBranch(e.target.value)}
                  placeholder="main"
                  className="bg-card"
                />
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                This branch will be used as the base for new task branches.
              </p>
            </div>

            {/* Execution mode */}
            <div>
              <label className="mb-3 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Execution Mode
              </label>
              <RadioGroup
                value={editExecutionMode}
                onValueChange={(value) =>
                  setEditExecutionMode(value as "auto" | "worktree" | "direct")
                }
                className="space-y-3"
              >
                <label
                  className={cn(
                    "relative flex cursor-pointer items-start gap-3 rounded-lg border-2 p-4 transition-all",
                    editExecutionMode === "auto"
                      ? "border-emerald-500/50 bg-emerald-500/5"
                      : "border-border bg-card hover:border-border-hover",
                  )}
                >
                  <RadioGroupItem value="auto" className="mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-emerald-400">Auto</span>
                      <Badge
                        variant="outline"
                        className="rounded border-emerald-500/30 bg-emerald-500/10 px-1 text-[10px] text-emerald-400"
                      >
                        Recommended
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Automatically detects the best mode based on repository characteristics.
                    </p>
                  </div>
                </label>

                <label
                  className={cn(
                    "relative flex cursor-pointer items-start gap-3 rounded-lg border-2 p-4 transition-all",
                    editExecutionMode === "worktree"
                      ? "border-violet-500/50 bg-violet-500/5"
                      : "border-border bg-card hover:border-border-hover",
                  )}
                >
                  <RadioGroupItem value="worktree" className="mt-0.5" />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-violet-400">Worktree</span>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Creates isolated copies for each task, enabling parallel execution.
                    </p>
                  </div>
                </label>

                <label
                  className={cn(
                    "relative flex cursor-pointer items-start gap-3 rounded-lg border-2 p-4 transition-all",
                    editExecutionMode === "direct"
                      ? "border-amber-500/50 bg-amber-500/5"
                      : "border-border bg-card hover:border-border-hover",
                  )}
                >
                  <RadioGroupItem value="direct" className="mt-0.5" />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-amber-400">Direct</span>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Runs tasks directly in the repository. One task at a time, no extra disk
                      space.
                    </p>
                  </div>
                </label>
              </RadioGroup>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeEditDialog}>
              Cancel
            </Button>
            <Button onClick={handleEditRepo} disabled={updateRepoMutation.isPending}>
              {updateRepoMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) closeDeleteDialog();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Repository</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove{" "}
              <strong className="text-foreground">{repoToDelete?.name}</strong>?
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will only remove the repository from Night Shift configuration. Your actual
            repository and task history will not be affected.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={closeDeleteDialog}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteRepo}
              disabled={deleteRepoMutation.isPending}
            >
              {deleteRepoMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Removing...
                </>
              ) : (
                "Remove"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Container>
  );
}
