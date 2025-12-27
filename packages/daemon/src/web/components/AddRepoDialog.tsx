/**
 * Add Repo Dialog
 *
 * Reusable repo creation dialog (extracted from Repos page).
 */

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useAddRepo, useInspectRepo } from "@/hooks/useRepos";
import type { Repo } from "@nightshift/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Loader2 } from "@/components/ui/icons";

export interface AddRepoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (repo: Repo) => void;
}

export function AddRepoDialog({ open, onOpenChange, onCreated }: AddRepoDialogProps) {
  const queryClient = useQueryClient();
  const addRepoMutation = useAddRepo();
  const inspectRepoMutation = useInspectRepo();

  const [newRepoPath, setNewRepoPath] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [inspectResult, setInspectResult] = useState<Awaited<
    ReturnType<typeof inspectRepoMutation.mutateAsync>
  > | null>(null);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const inspectReqIdRef = useRef(0);

  const closeDialog = () => {
    onOpenChange(false);
    setNewRepoPath("");
    setAddError(null);
    setInspectResult(null);
    setInspectError(null);
  };

  const handleInspectRepo = useEffectEvent((path: string) => {
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

  // Auto-inspect repo path (debounced) while dialog is open.
  useEffect(() => {
    if (!open) return;

    const path = newRepoPath.trim();
    if (!path) {
      setInspectResult(null);
      setInspectError(null);
      return;
    }

    const timer = handleInspectRepo(path);

    return () => clearTimeout(timer);
  }, [open, newRepoPath]);

  const handleAddRepo = async () => {
    if (!newRepoPath.trim()) {
      setAddError("Path is required");
      return;
    }

    try {
      const repo = await addRepoMutation.mutateAsync({
        path: newRepoPath.trim(),
      });

      // Keep Dashboard stats fresh (it relies on status.stats.repoCount).
      queryClient.invalidateQueries({ queryKey: ["status"] });

      toast.success("Repo added", {
        description: `${repo.name} is now configured for task execution.`,
      });

      const normalizedRepo: Repo = {
        ...repo,
        defaultBranch: repo.defaultBranch ?? "main",
        executionMode: repo.executionMode ?? "auto",
      };
      onCreated?.(normalizedRepo);
      closeDialog();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add repo");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) {
          // Reset state so re-opening is clean.
          setNewRepoPath("");
          setAddError(null);
          setInspectResult(null);
          setInspectError(null);
        }
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
            <label htmlFor="repo-path" className="mb-2 block text-sm font-medium text-foreground">
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
            <p className="mt-2 text-xs text-muted-foreground">
              The name and default branch will be auto-detected from git.
            </p>
          </div>

          {(inspectRepoMutation.isPending || inspectResult || inspectError) && (
            <div className="border border-border bg-background px-3 py-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-foreground">Auto-detected</p>
                {inspectRepoMutation.isPending && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Inspecting…
                  </div>
                )}
              </div>

              {inspectError && (
                <div className="mt-2 flex items-center gap-2 text-xs text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {inspectError}
                </div>
              )}

              {inspectResult && (
                <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                  <div className="grid grid-cols-[120px_1fr] gap-2">
                    <div className="text-muted-foreground">Name</div>
                    <div className="font-mono text-foreground">{inspectResult.name ?? "—"}</div>
                    <div className="text-muted-foreground">Default branch</div>
                    <div className="font-mono text-foreground">
                      {inspectResult.defaultBranch ?? "—"}
                    </div>
                    <div className="text-muted-foreground">GitHub</div>
                    <div className="font-mono text-foreground">
                      {inspectResult.github?.repoId ?? "—"}
                    </div>
                    <div className="text-muted-foreground">Origin remote</div>
                    <div className="font-mono text-foreground break-all">
                      {inspectResult.remoteUrl ?? "—"}
                    </div>
                    <div className="text-muted-foreground">Suggested mode</div>
                    <div className="text-foreground">
                      {inspectResult.suggestedExecution
                        ? `${inspectResult.suggestedExecution.mode} — ${inspectResult.suggestedExecution.reason}`
                        : "—"}
                    </div>
                  </div>

                  {inspectResult.stack?.tags?.length ? (
                    <div className="pt-1">
                      <div className="text-muted-foreground">Stack</div>
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
            <div className="flex items-center gap-2 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {addError}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={closeDialog}>
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
  );
}
