/**
 * Clone Workflow Dialog
 *
 * Dialog for cloning an existing workflow to create a custom copy.
 */

import { useState, useEffect } from "react";
import { useCloneWorkflow } from "@/hooks/useWorkflows";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2 } from "@/components/ui/icons";

interface WorkflowSummary {
  id: string;
  name: string;
  description: string;
  isBuiltin: boolean;
}

interface CloneWorkflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflow: WorkflowSummary | null;
  onSuccess?: (newWorkflowId: string) => void;
}

export function CloneWorkflowDialog({
  open,
  onOpenChange,
  workflow,
  onSuccess,
}: CloneWorkflowDialogProps) {
  const cloneWorkflowMutation = useCloneWorkflow();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  // Pre-fill form when workflow changes
  useEffect(() => {
    if (workflow && open) {
      setName(`Copy of ${workflow.name}`);
      setDescription(workflow.description);
    }
  }, [workflow, open]);

  const handleClose = () => {
    onOpenChange(false);
    setName("");
    setDescription("");
  };

  const handleSubmit = async () => {
    if (!workflow) return;

    if (!name.trim() || name.trim().length < 3) {
      toast.error("Name must be at least 3 characters");
      return;
    }

    try {
      const newWorkflow = await cloneWorkflowMutation.mutateAsync({
        sourceId: workflow.id,
        name: name.trim(),
        description: description.trim() || undefined,
      });

      toast.success("Workflow cloned", {
        description: `${newWorkflow.name} has been created.`,
      });

      handleClose();

      if (onSuccess) {
        onSuccess(newWorkflow.id);
      }
    } catch (err) {
      toast.error("Failed to clone workflow", {
        description: err instanceof Error ? err.message : "An error occurred",
      });
    }
  };

  const canSubmit = name.trim().length >= 3 && !cloneWorkflowMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Clone Workflow</DialogTitle>
          <DialogDescription>
            Create a customizable copy of{" "}
            <strong className="text-(--color-text-primary)">{workflow?.name}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="clone-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="clone-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Custom Workflow"
              className="mt-1"
            />
            <p className="mt-1 text-xs text-(--color-text-muted)">
              Give your workflow a unique name
            </p>
          </div>

          <div>
            <Label htmlFor="clone-description">Description</Label>
            <Textarea
              id="clone-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this workflow does..."
              rows={3}
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {cloneWorkflowMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Cloning...
              </>
            ) : (
              "Clone Workflow"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
