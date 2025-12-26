/**
 * New Task Dialog
 *
 * Unified task creation dialog with dual-mode support:
 * - Interactive: Chat-based conversation with Claude
 * - Workflow: Structured, automated task execution
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { client } from "@/web/integrations/orpc";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useRepos } from "@/hooks/useRepos";
import { MessageSquare, Workflow, Loader2 } from "@/components/ui/icons";

interface NewTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type TaskMode = "interactive" | "workflow";
type ExecutionModeOverride = "worktree" | "direct" | "default";

export function NewTaskDialog({ open, onOpenChange }: NewTaskDialogProps) {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<TaskMode>("interactive");
  const [selectedWorkflow, setSelectedWorkflow] = useState<string>("");
  const [selectedRepoId, setSelectedRepoId] = useState<string>("");
  const [autoYes, setAutoYes] = useState(true);
  const [executionModeOverride, setExecutionModeOverride] = useState<ExecutionModeOverride>("default");

  const { data: repos = [] } = useRepos();

  // Check repo status when repo is selected
  const { data: repoStatus } = useQuery({
    queryKey: ["repo-status", selectedRepoId],
    queryFn: async () => {
      if (!selectedRepoId) return null;
      return client.repos.checkStatus({ id: selectedRepoId });
    },
    enabled: !!selectedRepoId && open,
    refetchInterval: 5000, // Refresh every 5 seconds while dialog is open
  });

  // Auto-select repository if only one is available
  useEffect(() => {
    if (open && repos.length === 1 && !selectedRepoId) {
      setSelectedRepoId(repos[0]!.id);
    }
  }, [open, repos, selectedRepoId]);

  // Fetch available workflows from the API
  const { data: workflows, isLoading: isLoadingWorkflows } = useQuery({
    queryKey: ["workflows"],
    queryFn: async () => {
      return client.workflows.list({});
    },
    enabled: mode === "workflow",
  });

  const createTask = useMutation({
    mutationFn: async () => {
      return client.tasks.create({
        prompt,
        repoId: selectedRepoId, // Required
        autoYes: mode === "interactive" ? autoYes : true, // Workflows always auto-yes
        type: mode,
        workflowId: mode === "workflow" ? selectedWorkflow : undefined,
        // Pass execution mode override if user selected one
        executionMode: executionModeOverride !== "default" ? executionModeOverride : undefined,
      });
    },
    onSuccess: (data) => {
      toast.success("Task created");
      onOpenChange(false);
      // Navigate to task
      navigate(`/tasks/${data.id}`);
      // Reset form
      resetForm();
    },
    onError: (error) => {
      toast.error("Failed to create task", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
  });

  const resetForm = () => {
    setPrompt("");
    setMode("interactive");
    setSelectedWorkflow("");
    setSelectedRepoId("");
    setAutoYes(true);
    setExecutionModeOverride("default");
  };

  // Get selected repo details
  const selectedRepo = repos.find((r) => r.id === selectedRepoId);

  // Determine if direct mode is blocked
  const directModeBlocked =
    mode === "interactive"
      ? !repoStatus?.canCreateDirectChat
      : !repoStatus?.canCreateDirectWorkflow;

  const handleSubmit = () => {
    if (!prompt.trim()) {
      toast.error("Please enter a prompt");
      return;
    }

    if (!selectedRepoId) {
      toast.error("Please select a repository");
      return;
    }

    if (mode === "workflow" && !selectedWorkflow) {
      toast.error("Please select a workflow");
      return;
    }

    createTask.mutate();
  };

  const canSubmit =
    prompt.trim().length > 0 &&
    selectedRepoId.length > 0 &&
    repos.length > 0 &&
    (mode === "interactive" || (mode === "workflow" && selectedWorkflow)) &&
    !createTask.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>New Task</DialogTitle>
        </DialogHeader>

        {/* Prompt Input */}
        <div>
          <Label htmlFor="prompt">
            {mode === "interactive" ? "What do you want to do?" : "Task Description"}
          </Label>
          <Textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              mode === "interactive"
                ? "Describe your task or ask a question..."
                : "Provide details for the workflow..."
            }
            rows={3}
            className="mt-1"
          />
        </div>

        <div className="space-y-4">
          {/* Mode Selection */}
          <div>
            <Label>Mode</Label>
            <RadioGroup
              value={mode}
              onValueChange={(value) => {
                setMode(value as TaskMode);
                // Reset workflow selection when switching modes
                if (value === "interactive") {
                  setSelectedWorkflow("");
                }
              }}
              className="mt-2"
            >
              <div className="flex items-start space-x-3 rounded-none border border-input p-3 hover:bg-accent/50 transition-colors">
                <RadioGroupItem value="interactive" id="interactive" className="mt-0.5" />
                <div className="flex-1 space-y-1">
                  <Label
                    htmlFor="interactive"
                    className="flex items-center gap-2 font-medium cursor-pointer"
                  >
                    <MessageSquare className="size-4" />
                    Interactive
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Chat with Claude, iterate on ideas, explore solutions
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3 rounded-none border border-input p-3 hover:bg-accent/50 transition-colors">
                <RadioGroupItem value="workflow" id="workflow" className="mt-0.5" />
                <div className="flex-1 space-y-1">
                  <Label
                    htmlFor="workflow"
                    className="flex items-center gap-2 font-medium cursor-pointer"
                  >
                    <Workflow className="size-4" />
                    Workflow
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Structured automation with predefined steps
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>

          {/* Workflow Selection (only shown in workflow mode) */}
          {mode === "workflow" && (
            <div>
              <Label htmlFor="workflow-select">Select Workflow</Label>
              <Select
                value={selectedWorkflow}
                onValueChange={(value) => setSelectedWorkflow(value || "")}
              >
                <SelectTrigger id="workflow-select" className="mt-1 w-full">
                  <SelectValue>
                    {selectedWorkflow
                      ? workflows?.workflows.find((wf) => wf.id === selectedWorkflow)?.name
                      : "Choose a workflow..."}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {isLoadingWorkflows && (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  {!isLoadingWorkflows && workflows?.workflows.length === 0 && (
                    <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                      No workflows available
                    </div>
                  )}
                  {workflows?.workflows.map((wf) => (
                    <SelectItem key={wf.id} value={wf.id}>
                      <div className="space-y-0.5">
                        <div className="font-medium">{wf.name}</div>
                        {wf.description && (
                          <div className="text-xs text-muted-foreground">{wf.description}</div>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Repository Selection (required) */}
          <div>
            <Label htmlFor="repo-select">
              Repository <span className="text-destructive">*</span>
            </Label>
            <Select
              value={selectedRepoId}
              onValueChange={(value) => setSelectedRepoId(value || "")}
            >
              <SelectTrigger id="repo-select" className="mt-1 w-full">
                <SelectValue>
                  {selectedRepoId
                    ? repos.find((r) => r.id === selectedRepoId)?.name
                    : "Select a repository..."}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {repos.length === 0 ? (
                  <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                    No repositories available
                  </div>
                ) : (
                  repos.map((repo) => (
                    <SelectItem key={repo.id} value={repo.id}>
                      {repo.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {repos.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Add a repository in Settings before creating tasks
              </p>
            )}
          </div>

          {/* Execution Mode Override (only show when repo is not auto AND direct mode is available) */}
          {selectedRepoId &&
            selectedRepo &&
            selectedRepo.executionMode !== "auto" &&
            !directModeBlocked && (
              <div>
                <Label>Execution Mode Override</Label>
                <ButtonGroup className="mt-1 w-full">
                  <Button
                    type="button"
                    variant={executionModeOverride === "default" ? "default" : "outline"}
                    onClick={() => setExecutionModeOverride("default")}
                    className="flex-1"
                    data-slot="button"
                  >
                    Default ({selectedRepo.executionMode})
                  </Button>
                  <Button
                    type="button"
                    variant={executionModeOverride === "worktree" ? "default" : "outline"}
                    onClick={() => setExecutionModeOverride("worktree")}
                    className="flex-1"
                    data-slot="button"
                  >
                    Worktree
                  </Button>
                  <Button
                    type="button"
                    variant={executionModeOverride === "direct" ? "default" : "outline"}
                    onClick={() => setExecutionModeOverride("direct")}
                    className="flex-1"
                    data-slot="button"
                  >
                    Direct
                  </Button>
                </ButtonGroup>
                <p className="mt-1 text-xs text-muted-foreground">
                  Override the repository's default execution mode for this task only
                </p>
              </div>
            )}

          {/* Execution Mode Info & Warnings */}
          {selectedRepoId && selectedRepo && (
            <div className="space-y-2">
              {/* Only show execution mode info when override buttons are not shown */}
              {!(repoStatus && directModeBlocked && repoStatus.blockedReason) &&
                !(repoStatus && repoStatus.hasSharedLocks && mode === "workflow") &&
                !(selectedRepo.executionMode !== "auto" && !directModeBlocked) && (
                  <div className="text-xs text-muted-foreground">
                    <strong>Execution Mode:</strong>{" "}
                    {selectedRepo.executionMode === "auto"
                      ? "Auto-detect (will choose worktree or direct based on repo)"
                      : selectedRepo.executionMode === "worktree"
                        ? "Worktree (creates isolated copy)"
                        : "Direct (runs in-place)"}
                  </div>
                )}

              {/* Info for direct mode blocked (covers uncommitted changes, locks, etc.) */}
              {repoStatus && directModeBlocked && repoStatus.blockedReason && (
                <div className="rounded-none border border-blue-500/50 bg-blue-500/10 p-3 text-xs">
                  <strong className="text-blue-600">ℹ Info:</strong> {repoStatus.blockedReason}.{" "}
                  {mode === "workflow"
                    ? "Workflow will use worktree mode automatically."
                    : "Task will use worktree mode automatically."}
                </div>
              )}

              {/* Shared locks info (only show if not already covered by blockedReason) */}
              {repoStatus &&
                repoStatus.hasSharedLocks &&
                mode === "workflow" &&
                !directModeBlocked && (
                  <div className="rounded-none border border-orange-500/50 bg-orange-500/10 p-3 text-xs">
                    <strong className="text-orange-600">Note:</strong>{" "}
                    {repoStatus.sharedLockHolders.length} chat session(s) are active on this
                    repository. Workflow will use worktree mode to avoid conflicts.
                  </div>
                )}
            </div>
          )}

          {/* Auto-yes Option (only for interactive mode) */}
          {mode === "interactive" && (
            <div className="flex items-center space-x-2 rounded-none border border-input p-3 bg-muted/30">
              <Checkbox
                id="autoYes"
                checked={autoYes}
                onCheckedChange={(checked) => setAutoYes(checked === true)}
              />
              <Label htmlFor="autoYes" className="font-normal cursor-pointer flex-1">
                Auto-approve file edits (recommended)
              </Label>
            </div>
          )}

          {mode === "workflow" && (
            <div className="rounded-none border border-blue-500/50 bg-blue-500/10 p-3 text-xs">
              <strong className="text-blue-600">ℹ Info:</strong> Workflows run with auto-approve enabled by default.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {createTask.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Task"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
