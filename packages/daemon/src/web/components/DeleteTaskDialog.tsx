/**
 * Delete Task Dialog
 *
 * Shared confirmation dialog for deleting tasks.
 */

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface DeleteTaskDialogProps {
  /** Task to delete (null = dialog closed) */
  task: { id: string; prompt: string; executionMode?: string | null } | null;
  /** Called when user confirms deletion */
  onConfirm: (deleteBranch: boolean) => void;
  /** Called when user cancels or closes dialog */
  onCancel: () => void;
  /** Whether deletion is in progress */
  isDeleting?: boolean;
}

function truncatePrompt(prompt: string, maxLen = 80): string {
  if (prompt.length <= maxLen) return prompt;
  return prompt.substring(0, maxLen) + "...";
}

export function DeleteTaskDialog({
  task,
  onConfirm,
  onCancel,
  isDeleting = false,
}: DeleteTaskDialogProps) {
  const [deleteBranch, setDeleteBranch] = useState(false);
  const isWorktree = task?.executionMode === "worktree";

  return (
    <AlertDialog
      open={!!task}
      onOpenChange={() => {
        onCancel();
        setDeleteBranch(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Task</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this task?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3">
          <div className="rounded-md bg-muted p-2 text-sm font-medium text-foreground">
            {task && truncatePrompt(task.prompt, 80)}
          </div>

          {/* Checkbox for deleting branch (only for worktree tasks) */}
          {isWorktree && (
            <div className="space-y-2 rounded-md border border-border p-3">
              <div className="flex items-start space-x-2">
                <Checkbox
                  id="delete-branch"
                  checked={deleteBranch}
                  onCheckedChange={(checked) => setDeleteBranch(checked === true)}
                  disabled={isDeleting}
                />
                <Label
                  htmlFor="delete-branch"
                  className="flex-1 text-sm font-medium leading-none cursor-pointer"
                >
                  Also delete the git branch
                </Label>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                This will permanently delete the task's branch from the repository
              </p>
            </div>
          )}

          <span className="text-xs text-destructive">This action cannot be undone.</span>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => onConfirm(deleteBranch)}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
