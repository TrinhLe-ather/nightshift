/**
 * Repos Page
 *
 * Manage configured repositories for task execution.
 */

import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  useAddRepo,
  useDeleteRepo,
  useInspectRepo,
  useRepoBranches,
  useRepos,
  useUpdateRepo,
} from "@/hooks/useRepos";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertCircle,
  FileEdit,
  Folder,
  GitBranch,
  Loader2,
  Plus,
  Trash2,
} from "@/components/ui/icons";
import { Container } from "@/components/layout/Container";
import { cn } from "@/lib/utils";

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

export function Repos() {
  const { data: repos, isLoading } = useRepos();
  const addRepoMutation = useAddRepo();
  const updateRepoMutation = useUpdateRepo();
  const deleteRepoMutation = useDeleteRepo();
  const inspectRepoMutation = useInspectRepo();

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
  const [newRepoPath, setNewRepoPath] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [inspectResult, setInspectResult] = useState<Awaited<
    ReturnType<typeof inspectRepoMutation.mutateAsync>
  > | null>(null);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const inspectReqIdRef = useRef(0);

  const [editName, setEditName] = useState("");
  const [editDefaultBranch, setEditDefaultBranch] = useState("");
  const [editExecutionMode, setEditExecutionMode] = useState<"auto" | "worktree" | "direct">(
    "auto",
  );

  const closeAddDialog = () => {
    setAddDialogOpen(false);
    setNewRepoPath("");
    setAddError(null);
    setInspectResult(null);
    setInspectError(null);
  };

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

  const inspectRepo = useEffectEvent(async (path: string) => {
    if (!addDialogOpen) return;

    const reqId = ++inspectReqIdRef.current;
    const timer = setTimeout(async () => {
      try {
        setInspectError(null);
        const result = await inspectRepoMutation.mutateAsync({ path });
        if (inspectReqIdRef.current !== reqId) return; // stale
        setInspectResult(result);
      } catch (err) {
        if (inspectReqIdRef.current !== reqId) return; // stale
        setInspectResult(null);
        setInspectError(err instanceof Error ? err.message : "Failed to inspect repo");
      }
    }, 350);

    return timer;
  });

  useEffect(() => {
    if (!addDialogOpen) return;

    const path = newRepoPath.trim();
    if (!path) {
      setInspectResult(null);
      setInspectError(null);
      return;
    }

    inspectRepo(path);
  }, [addDialogOpen, newRepoPath]);

  const handleAddRepo = async () => {
    if (!newRepoPath.trim()) {
      setAddError("Path is required");
      return;
    }

    try {
      const repo = await addRepoMutation.mutateAsync({
        path: newRepoPath.trim(),
      });
      toast.success("Repo added", {
        description: `${repo.name} is now configured for task execution.`,
      });
      closeAddDialog();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add repo");
    }
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
      toast.success("Repo updated", {
        description: `${repo.name} settings saved.`,
      });
      closeEditDialog();
    } catch (err) {
      toast.error("Failed to update repo", {
        description: err instanceof Error ? err.message : "An error occurred",
      });
    }
  };

  const handleDeleteRepo = async () => {
    if (!repoToDelete) return;

    try {
      await deleteRepoMutation.mutateAsync(repoToDelete.id);
      toast.success("Repo removed", {
        description: `${repoToDelete.name} has been removed from configuration.`,
      });
      closeDeleteDialog();
    } catch (err) {
      toast.error("Failed to remove repo", {
        description: err instanceof Error ? err.message : "An error occurred",
      });
    }
  };

  const openDeleteDialog = (id: string, name: string) => {
    setRepoToDelete({ id, name });
    setDeleteDialogOpen(true);
  };

  return (
    <Container className="py-4 lg:py-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-(--color-text-primary)">Repositories</h1>
          <p className="mt-1 text-sm text-(--color-text-muted)">
            Configure repositories for task execution
          </p>
        </div>
        <Button onClick={() => setAddDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Repo
        </Button>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-(--color-text-muted)" />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && (!repos || repos.length === 0) && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-(--color-surface) py-16">
          <Folder className="h-12 w-12 text-(--color-text-muted)" />
          <p className="mt-4 text-lg text-(--color-text-secondary)">No repositories configured</p>
          <p className="mt-2 text-sm text-(--color-text-muted)">
            Add a repository to start executing tasks
          </p>
          <Button className="mt-6" onClick={() => setAddDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Your First Repo
          </Button>
        </div>
      )}

      {/* Repos Grid */}
      {!isLoading && repos && repos.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {repos.map((repo) => (
            <Card key={repo.id} className="transition-shadow duration-150 hover:ring-foreground/20">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center gap-2">
                  <Folder className="h-4 w-4 text-(--color-text-muted)" />
                  <span className="truncate">{repo.name}</span>
                </CardTitle>
                <CardDescription className="truncate font-mono">{repo.path}</CardDescription>

                <CardAction>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-(--color-text-muted) hover:text-(--color-text-primary)"
                      onClick={() =>
                        openEditDialog({
                          id: repo.id,
                          name: repo.name,
                          path: repo.path,
                          defaultBranch: repo.defaultBranch,
                          executionMode: repo.executionMode,
                        })
                      }
                      aria-label={`Edit ${repo.name}`}
                      title="Edit"
                    >
                      <FileEdit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-(--color-text-muted) hover:text-(--color-destructive)"
                      onClick={() => openDeleteDialog(repo.id, repo.name)}
                      aria-label={`Remove ${repo.name}`}
                      title="Remove"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardAction>
              </CardHeader>

              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-mono text-xs">
                    <GitBranch className="mr-1 h-3 w-3" />
                    {repo.defaultBranch}
                  </Badge>
                  <Badge variant="secondary" className="font-mono text-xs">
                    {repo.executionMode ?? "auto"}
                  </Badge>
                </div>

                <div className="text-xs text-(--color-text-muted)">
                  Added{" "}
                  <span className="text-(--color-text-secondary)">
                    {formatDate(repo.createdAt)}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Repo Dialog */}
      <Dialog
        open={addDialogOpen}
        onOpenChange={(open) => {
          setAddDialogOpen(open);
          if (!open) closeAddDialog();
        }}
      >
        <DialogContent className="md:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Repository</DialogTitle>
            <DialogDescription>
              Enter the absolute path to a git repository on your machine.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="repo-path"
                className="mb-2 block text-sm font-medium text-(--color-text-primary)"
              >
                Repository Path
              </label>
              <Input
                id="repo-path"
                placeholder="/Users/you/projects/my-repo"
                value={newRepoPath}
                onChange={(e) => {
                  setNewRepoPath(e.target.value);
                  setAddError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !addRepoMutation.isPending) {
                    handleAddRepo();
                  }
                }}
                autoFocus
              />
              <p className="mt-2 text-xs text-(--color-text-muted)">
                The name and default branch will be auto-detected from git.
              </p>
            </div>

            {(inspectRepoMutation.isPending || inspectResult || inspectError) && (
              <div className="rounded-md border border-border bg-(--color-background) px-3 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-(--color-text-primary)">Auto-detected</p>
                  {inspectRepoMutation.isPending && (
                    <div className="flex items-center gap-2 text-xs text-(--color-text-muted)">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Inspecting…
                    </div>
                  )}
                </div>

                {inspectError && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-(--color-destructive)">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {inspectError}
                  </div>
                )}

                {inspectResult && (
                  <div className="mt-3 space-y-2 text-xs text-(--color-text-secondary)">
                    <div className="grid grid-cols-[120px_1fr] gap-2">
                      <div className="text-(--color-text-muted)">Name</div>
                      <div className="font-mono text-(--color-text-primary)">
                        {inspectResult.name ?? "—"}
                      </div>
                      <div className="text-(--color-text-muted)">Default branch</div>
                      <div className="font-mono text-(--color-text-primary)">
                        {inspectResult.defaultBranch ?? "—"}
                      </div>
                      <div className="text-(--color-text-muted)">GitHub</div>
                      <div className="font-mono text-(--color-text-primary)">
                        {inspectResult.github?.repoId ?? "—"}
                      </div>
                      <div className="text-(--color-text-muted)">Origin remote</div>
                      <div className="font-mono text-(--color-text-primary) break-all">
                        {inspectResult.remoteUrl ?? "—"}
                      </div>
                      <div className="text-(--color-text-muted)">Suggested mode</div>
                      <div className="text-(--color-text-primary)">
                        {inspectResult.suggestedExecution
                          ? `${inspectResult.suggestedExecution.mode} — ${inspectResult.suggestedExecution.reason}`
                          : "—"}
                      </div>
                    </div>

                    {inspectResult.stack?.tags?.length ? (
                      <div className="pt-1">
                        <div className="text-(--color-text-muted)">Stack</div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {inspectResult.stack.tags.map((t) => (
                            <Badge key={t} variant="secondary" className="text-xs">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            )}

            {addError && (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-(--color-destructive)">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {addError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeAddDialog}>
              Cancel
            </Button>
            <Button onClick={handleAddRepo} disabled={addRepoMutation.isPending}>
              {addRepoMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                "Add Repo"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <DialogTitle>Edit Repository</DialogTitle>
            <DialogDescription>
              Update how Night Shift executes tasks for this repo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-(--color-text-primary)">
                Repository
              </label>
              <div className="space-y-1 text-xs text-(--color-text-muted)">
                <div className="font-mono text-(--color-text-primary)">{repoToEdit?.name}</div>
                <div className="font-mono break-all">{repoToEdit?.path}</div>
              </div>
            </div>

            <div>
              <label
                htmlFor="edit-name"
                className="mb-2 block text-sm font-medium text-(--color-text-primary)"
              >
                Name
              </label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="my-repo"
              />
            </div>

            <div>
              <label
                htmlFor="edit-default-branch"
                className="mb-2 block text-sm font-medium text-(--color-text-primary)"
              >
                Default branch
              </label>
              {branchesLoading ? (
                <div className="flex items-center gap-2 rounded-md border border-border bg-(--color-surface) px-3 py-2 text-sm text-(--color-text-muted)">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading branches...
                </div>
              ) : branchesData && branchesData.branches.length > 0 ? (
                <Select
                  value={editDefaultBranch}
                  onValueChange={(v) => setEditDefaultBranch(v ?? "")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {branchesData.branches.map((branch) => (
                      <SelectItem key={branch} value={branch}>
                        <span className="flex items-center gap-2">
                          <GitBranch className="h-3.5 w-3.5 text-(--color-text-muted)" />
                          <span>{branch}</span>
                          {branch === branchesData.currentBranch && (
                            <Badge variant="default" className="ml-1 text-xs">
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
                />
              )}
              <p className="mt-2 text-xs text-(--color-text-muted)">
                This branch will be used as the base for new task branches.
              </p>
            </div>

            <div>
              <label className="mb-3 block text-sm font-medium text-(--color-text-primary)">
                Execution Mode
              </label>
              <p className="mb-4 text-xs text-(--color-text-muted)">
                Select the execution environment for your repository.
              </p>
              <RadioGroup
                value={editExecutionMode}
                onValueChange={(value) =>
                  setEditExecutionMode(value as "auto" | "worktree" | "direct")
                }
              >
                <label
                  className={cn(
                    "relative flex cursor-pointer items-start gap-3 rounded-lg border-2 p-4 transition-all",
                    editExecutionMode === "auto"
                      ? "border-primary bg-primary/5"
                      : "border-border bg-(--color-surface) hover:border-border-hover",
                  )}
                >
                  <RadioGroupItem value="auto" className="mt-0.5" />
                  <div className="flex-1">
                    <div className="font-medium text-sm text-primary">Auto (Recommended)</div>
                    <div className="mt-1 text-xs text-(--color-text-muted)">
                      Automatically detects the best mode based on repository characteristics. Uses
                      worktree for standard repos, direct for large repos with LFS or Unreal
                      projects.
                    </div>
                  </div>
                </label>

                <label
                  className={cn(
                    "relative flex cursor-pointer items-start gap-3 rounded-lg border-2 p-4 transition-all",
                    editExecutionMode === "worktree"
                      ? "border-primary bg-primary/5"
                      : "border-border bg-(--color-surface) hover:border-border-hover",
                  )}
                >
                  <RadioGroupItem value="worktree" className="mt-0.5" />
                  <div className="flex-1">
                    <div className="font-medium text-sm text-(--color-text-primary)">Worktree</div>
                    <div className="mt-1 text-xs text-(--color-text-muted)">
                      Creates isolated copies for each task, enabling parallel execution. Requires
                      additional disk space.
                    </div>
                  </div>
                </label>

                <label
                  className={cn(
                    "relative flex cursor-pointer items-start gap-3 rounded-lg border-2 p-4 transition-all",
                    editExecutionMode === "direct"
                      ? "border-primary bg-primary/5"
                      : "border-border bg-(--color-surface) hover:border-border-hover",
                  )}
                >
                  <RadioGroupItem value="direct" className="mt-0.5" />
                  <div className="flex-1">
                    <div className="font-medium text-sm text-(--color-text-primary)">Direct</div>
                    <div className="mt-1 text-xs text-(--color-text-muted)">
                      Runs tasks directly in the repository directory. One task at a time, no extra
                      disk space. Better for very large repos.
                    </div>
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
                "Save changes"
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
              <strong className="text-(--color-text-primary)">{repoToDelete?.name}</strong>?
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-(--color-text-secondary)">
            This will only remove the repo from Night Shift configuration. Your actual repository
            and task history will not be affected.
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
