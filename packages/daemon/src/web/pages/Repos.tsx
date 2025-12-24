/**
 * Repos Page
 *
 * Manage configured repositories for task execution.
 */

import { useState } from "react";
import { useAddRepo, useDeleteRepo, useRepos } from "@/hooks/useRepos";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { AlertCircle, Folder, GitBranch, Loader2, Plus, Trash2 } from "lucide-react";

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
  const deleteRepoMutation = useDeleteRepo();
  const { addToast } = useToast();

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [repoToDelete, setRepoToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [newRepoPath, setNewRepoPath] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const handleAddRepo = async () => {
    if (!newRepoPath.trim()) {
      setAddError("Path is required");
      return;
    }

    try {
      const repo = await addRepoMutation.mutateAsync({
        path: newRepoPath.trim(),
      });
      addToast({
        title: "Repo added",
        description: `${repo.name} is now configured for task execution.`,
        variant: "success",
      });
      setAddDialogOpen(false);
      setNewRepoPath("");
      setAddError(null);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add repo");
    }
  };

  const handleDeleteRepo = async () => {
    if (!repoToDelete) return;

    try {
      await deleteRepoMutation.mutateAsync(repoToDelete.id);
      addToast({
        title: "Repo removed",
        description: `${repoToDelete.name} has been removed from configuration.`,
        variant: "success",
      });
      setDeleteDialogOpen(false);
      setRepoToDelete(null);
    } catch (err) {
      addToast({
        title: "Failed to remove repo",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "error",
      });
    }
  };

  const openDeleteDialog = (id: string, name: string) => {
    setRepoToDelete({ id, name });
    setDeleteDialogOpen(true);
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Repositories</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
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
          <Loader2 className="h-6 w-6 animate-spin text-[var(--color-text-muted)]" />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && (!repos || repos.length === 0) && (
        <div className="flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] py-16">
          <Folder className="h-12 w-12 text-[var(--color-text-muted)]" />
          <p className="mt-4 text-lg text-[var(--color-text-secondary)]">
            No repositories configured
          </p>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Add a repository to start executing tasks
          </p>
          <Button className="mt-6" onClick={() => setAddDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Your First Repo
          </Button>
        </div>
      )}

      {/* Repos Table */}
      {!isLoading && repos && repos.length > 0 && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Path</TableHead>
                <TableHead>Default Branch</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {repos.map((repo) => (
                <TableRow key={repo.id}>
                  <TableCell>
                    <span className="font-medium text-[var(--color-text-primary)]">
                      {repo.name}
                    </span>
                  </TableCell>
                  <TableCell>
                    <code className="rounded bg-[var(--color-background)] px-2 py-1 text-xs text-[var(--color-text-secondary)]">
                      {repo.path}
                    </code>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">
                      <GitBranch className="mr-1 h-3 w-3" />
                      {repo.defaultBranch}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-[var(--color-text-muted)]">
                    {formatDate(repo.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-[var(--color-text-muted)] hover:text-[var(--color-destructive)]"
                      onClick={() => openDeleteDialog(repo.id, repo.name)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add Repo Dialog */}
      <Dialog
        open={addDialogOpen}
        onClose={() => {
          setAddDialogOpen(false);
          setNewRepoPath("");
          setAddError(null);
        }}
      >
        <DialogHeader
          onClose={() => {
            setAddDialogOpen(false);
            setNewRepoPath("");
            setAddError(null);
          }}
        >
          <DialogTitle>Add Repository</DialogTitle>
          <DialogDescription>
            Enter the absolute path to a git repository on your machine.
          </DialogDescription>
        </DialogHeader>
        <DialogContent>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="repo-path"
                className="mb-2 block text-sm font-medium text-[var(--color-text-primary)]"
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
              <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                The name and default branch will be auto-detected from git.
              </p>
            </div>
            {addError && (
              <div className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-destructive)]/10 px-3 py-2 text-sm text-[var(--color-destructive)]">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {addError}
              </div>
            )}
          </div>
        </DialogContent>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setAddDialogOpen(false);
              setNewRepoPath("");
              setAddError(null);
            }}
          >
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
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
          setRepoToDelete(null);
        }}
      >
        <DialogHeader
          onClose={() => {
            setDeleteDialogOpen(false);
            setRepoToDelete(null);
          }}
        >
          <DialogTitle>Remove Repository</DialogTitle>
          <DialogDescription>
            Are you sure you want to remove{" "}
            <strong className="text-[var(--color-text-primary)]">{repoToDelete?.name}</strong>?
          </DialogDescription>
        </DialogHeader>
        <DialogContent>
          <p className="text-sm text-[var(--color-text-secondary)]">
            This will only remove the repo from Night Shift configuration. Your actual repository
            and task history will not be affected.
          </p>
        </DialogContent>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setDeleteDialogOpen(false);
              setRepoToDelete(null);
            }}
          >
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
      </Dialog>
    </div>
  );
}
