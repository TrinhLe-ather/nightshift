/**
 * Edit Task Dialog
 *
 * Dialog for editing task details. Only available for pending or failed tasks.
 * Based on NewTaskDialog structure.
 */

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { client } from "@/web/integrations/orpc";
import { toast } from "sonner";
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal";
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
import { useUpdateTask } from "@/hooks/useTasks";
import type { Task } from "../../db/drizzle";

interface EditTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task | null;
}

type ExecutionModeOverride = "worktree" | "direct" | "default";

export function EditTaskDialog({ open, onOpenChange, task }: EditTaskDialogProps) {
  // Form state - initialized empty, will be set by useEffect when dialog opens
  const [prompt, setPrompt] = useState("");
  const [selectedWorkflow, setSelectedWorkflow] = useState<string>("");
  const [selectedRepoId, setSelectedRepoId] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [executionModeOverride, setExecutionModeOverride] =
    useState<ExecutionModeOverride>("default");

  // Track which task we've initialized for
  const [initializedForTaskId, setInitializedForTaskId] = useState<string | null>(null);

  const updateTask = useUpdateTask();
  const { data: repos = [] } = useRepos();

  // Check repo status when repo is selected
  const { data: repoStatus } = useQuery({
    queryKey: ["repo-status", selectedRepoId],
    queryFn: async () => {
      if (!selectedRepoId) return null;
      return client.repos.checkStatus({ id: selectedRepoId });
    },
    enabled: !!selectedRepoId && open,
    refetchInterval: 5000,
  });

  // Fetch available workflows from the API
  const { data: workflows, isLoading: isLoadingWorkflows } = useQuery({
    queryKey: ["workflows"],
    queryFn: async () => {
      return client.workflows.list({});
    },
    enabled: true, // Always enabled like NewTaskDialog
  });

  // Fetch workflow details when a workflow is selected
  const { data: workflowDetails, isLoading: isLoadingWorkflowDetails } =
    useWorkflow(selectedWorkflow);

  // Initialize form when dialog opens with task data
  useEffect(() => {
    if (!task) return;

    if (open && initializedForTaskId !== task.id) {
      setPrompt(task.prompt);
      setSelectedWorkflow(task.workflowId || "quick-task");
      setSelectedRepoId(task.repoId || "");
      setSelectedModel(task.model || "");
      setExecutionModeOverride(
        task.executionMode ? (task.executionMode as ExecutionModeOverride) : "default"
      );
      setInitializedForTaskId(task.id);
    }
    // Reset when dialog closes
    if (!open) {
      setInitializedForTaskId(null);
    }
  }, [open, task, initializedForTaskId]);

  // Don't render if no task
  if (!task) {
    return null;
  }

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

    // Convert "_default" back to null for API
    const modelOverride =
      selectedModel && selectedModel !== "_default" ? selectedModel : null;

    const data = {
      prompt: prompt.trim(),
      workflowId: selectedWorkflow || "quick-task",
      model: modelOverride,
      repoId: selectedRepoId,
      executionMode: executionModeOverride !== "default" ? executionModeOverride : null,
    };

    updateTask.mutate(
      { id: task.id, data },
      {
        onSuccess: () => {
          toast.success("Task updated");
          onOpenChange(false);
        },
        onError: (error) => {
          toast.error("Failed to update task", {
            description: error instanceof Error ? error.message : "Unknown error",
          });
        },
      }
    );
  };

  const canSubmit =
    prompt.trim().length > 0 &&
    selectedRepoId.length > 0 &&
    repos.length > 0 &&
    !updateTask.isPending;

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="sm:max-w-[600px] bg-card">
        <ModalHeader>
          <ModalTitle>Edit Task</ModalTitle>
        </ModalHeader>

        <ModalBody className="space-y-4">
          {/* Status indicator */}
          <div className="flex items-center gap-2 text-xs border-b border-border pb-3 mb-1">
            <span className="text-foreground font-medium">Status:</span>
            <Badge
              variant="outline"
              className={task.status === "failed"
                ? "border-destructive/50 bg-destructive/10 text-destructive"
                : "border-primary/50 bg-primary/10 text-primary"}
            >
              {task.status}
            </Badge>
            {task.status === "failed" && (
              <span className="text-muted-foreground">(You can edit and retry)</span>
            )}
          </div>

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

          {/* Workflow Selection - EXACT COPY from NewTaskDialog */}
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

          {/* Model Selection - EXACT COPY from NewTaskDialog */}
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

          {/* Repository Selection - EXACT COPY from NewTaskDialog */}
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

          {/* Execution Mode Override - EXACT COPY from NewTaskDialog */}
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

          {/* Execution Mode Info & Warnings - EXACT COPY from NewTaskDialog */}
          {selectedRepoId && selectedRepo && (
            <div className="space-y-2">
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

              {repoStatus && directModeBlocked && repoStatus.blockedReason && (
                <div className="border border-blue-500/50 bg-blue-500/10 p-3 text-xs">
                  <strong className="text-blue-600">ℹ Info:</strong> {repoStatus.blockedReason}.{" "}
                  Workflow will use worktree mode automatically.
                </div>
              )}

              {repoStatus && repoStatus.hasSharedLocks && !directModeBlocked && (
                <div className="border border-orange-500/50 bg-orange-500/10 p-3 text-xs">
                  <strong className="text-orange-600">Note:</strong>{" "}
                  {repoStatus.sharedLockHolders.length} chat session(s) are active on this
                  repository. Workflow will use worktree mode to avoid conflicts.
                </div>
              )}
            </div>
          )}
        </ModalBody>

        <ModalFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {updateTask.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
