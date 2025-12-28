/**
 * New Task Dialog
 *
 * Task creation dialog for workflow execution.
 * Workflow-only: every task runs a workflow (defaults to "quick-task").
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRepos } from "@/hooks/useRepos";
import { useWorkflow } from "@/hooks/useWorkflows";
import { Badge } from "@/components/ui/badge";
import { Loader2, ExternalLink } from "@/components/ui/icons";
import { MODEL_OPTIONS, getModelColor } from "@/web/lib/models";

interface NewTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ExecutionModeOverride = "worktree" | "direct" | "default";

export function NewTaskDialog({ open, onOpenChange }: NewTaskDialogProps) {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [selectedWorkflow, setSelectedWorkflow] = useState<string>("");
  const [selectedRepoId, setSelectedRepoId] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [executionModeOverride, setExecutionModeOverride] =
    useState<ExecutionModeOverride>("default");

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
    enabled: true,
  });

  // Fetch workflow details when a workflow is selected
  const { data: workflowDetails, isLoading: isLoadingWorkflowDetails } =
    useWorkflow(selectedWorkflow);

  // Workflow-only: default to built-in quick-task workflow when dialog opens
  useEffect(() => {
    if (!open) return;
    if (!selectedWorkflow) {
      setSelectedWorkflow("quick-task");
    }
  }, [open, selectedWorkflow]);

  const createTask = useMutation({
    mutationFn: async () => {
      // Convert "_default" back to undefined for API
      const modelOverride =
        selectedModel && selectedModel !== "_default" ? selectedModel : undefined;
      return client.tasks.create({
        prompt,
        repoId: selectedRepoId, // Required
        autoYes: true, // Always auto-approve
        workflowId: selectedWorkflow || "quick-task",
        model: modelOverride,
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
    setSelectedWorkflow("");
    setSelectedRepoId("");
    setSelectedModel("");
    setExecutionModeOverride("default");
  };

  // Get selected repo details
  const selectedRepo = repos.find((r) => r.id === selectedRepoId);

  // Determine if direct mode is blocked
  const directModeBlocked = !repoStatus?.canCreateDirectWorkflow;

  const handleSubmit = () => {
    if (!prompt.trim()) {
      toast.error("Please enter a prompt");
      return;
    }

    if (!selectedRepoId) {
      toast.error("Please select a repository");
      return;
    }

    createTask.mutate();
  };

  const canSubmit =
    prompt.trim().length > 0 &&
    selectedRepoId.length > 0 &&
    repos.length > 0 &&
    !createTask.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>New Task</DialogTitle>
        </DialogHeader>

        {/* Prompt Input */}
        <div>
          <Label htmlFor="prompt">Task Description</Label>
          <Textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe your task..."
            rows={3}
            className="mt-1"
          />
        </div>

        <div className="space-y-4">
          {/* Workflow Selection */}
          <div>
            <Label htmlFor="workflow-select">Workflow</Label>
            <Select
              value={selectedWorkflow}
              onValueChange={(value) => setSelectedWorkflow(value || "quick-task")}
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

            {/* Workflow Preview */}
            {selectedWorkflow && (
              <div className="mt-3 border border-border bg-muted/30 p-3">
                {isLoadingWorkflowDetails ? (
                  <div className="flex items-center justify-center py-2">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  </div>
                ) : workflowDetails ? (
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium text-sm">{workflowDetails.name}</div>
                        <div className="text-xs text-muted-foreground line-clamp-2">
                          {workflowDetails.description}
                        </div>
                      </div>
                      {workflowDetails.isBuiltin && (
                        <Badge variant="secondary" className="text-xs shrink-0">
                          Built-in
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">
                        {workflowDetails.definition.steps.length} step
                        {workflowDetails.definition.steps.length !== 1 ? "s" : ""}
                      </Badge>
                      {workflowDetails.definition.model && (
                        <Badge variant="outline" className="text-xs">
                          Model: {workflowDetails.definition.model}
                        </Badge>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs"
                      onClick={() => {
                        window.open(`/workflows/${selectedWorkflow}`, "_blank");
                      }}
                    >
                      View workflow details
                      <ExternalLink className="ml-1 size-3" />
                    </Button>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    Failed to load workflow details
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Model Selection */}
          <div>
            <Label htmlFor="model-select">Model Override</Label>
            <p className="text-xs text-muted-foreground mt-1 mb-2">
              Override the{" "}
              {selectedWorkflow && workflowDetails?.definition.model
                ? `workflow default (${workflowDetails.definition.model})`
                : "default model (sonnet)"}
            </p>
            <Select
              value={selectedModel || "_default"}
              onValueChange={(value) =>
                setSelectedModel(value === "_default" || !value ? "" : value)
              }
            >
              <SelectTrigger id="model-select" className="mt-1 w-full">
                <SelectValue>
                  {selectedModel ? (
                    <span className={getModelColor(selectedModel)}>
                      {MODEL_OPTIONS.find((m) => m.value === selectedModel)?.label}
                    </span>
                  ) : (
                    "Use default"
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {MODEL_OPTIONS.map((option) => (
                  <SelectItem key={option.value || "_default"} value={option.value || "_default"}>
                    <span className={option.color}>{option.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
                !(repoStatus && repoStatus.hasSharedLocks) &&
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
                <div className="border border-blue-500/50 bg-blue-500/10 p-3 text-xs">
                  <strong className="text-blue-600">ℹ Info:</strong> {repoStatus.blockedReason}.{" "}
                  Workflow will use worktree mode automatically.
                </div>
              )}

              {/* Shared locks info (only show if not already covered by blockedReason) */}
              {repoStatus && repoStatus.hasSharedLocks && !directModeBlocked && (
                <div className="border border-orange-500/50 bg-orange-500/10 p-3 text-xs">
                  <strong className="text-orange-600">Note:</strong>{" "}
                  {repoStatus.sharedLockHolders.length} chat session(s) are active on this
                  repository. Workflow will use worktree mode to avoid conflicts.
                </div>
              )}
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
