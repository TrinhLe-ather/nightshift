/**
 * Workflow Detail Page
 *
 * Displays detailed information about a workflow including all steps.
 * Features a visual timeline/flowchart design showing step progression.
 *
 * Design: Technical blueprint aesthetic with connected node visualization.
 */

import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useWorkflow, useDeleteWorkflow, useExportWorkflow } from "@/hooks/useWorkflows";
import { cn } from "@/lib/utils";
import { getModelStyle } from "@/lib/models";
import { toast } from "sonner";
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
import { Container } from "@/components/layout/Container";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Download,
  FileEdit,
  Loader2,
  Trash2,
  Workflow,
  Activity,
  Check,
  Play,
  Clock,
  Settings,
} from "@/components/ui/icons";
import { CloneWorkflowDialog } from "@/components/CloneWorkflowDialog";

interface WorkflowStep {
  name: string;
  prompt: string;
  model?: string;
  tools?: {
    enable?: string[];
    disable?: string[];
  };
  maxRetries?: number;
  autoCommit?: boolean;
}

// Highlight template variables in prompt
function HighlightedPrompt({ text }: { text: string }) {
  const parts = text.split(/(\{\{[^}]+\}\})/g);
  return (
    <span>
      {parts.map((part, idx) => {
        if (part.startsWith("{{") && part.endsWith("}}")) {
          return (
            <span
              key={idx}
              className="mx-0.5 inline-block bg-primary/20 px-1.5 py-0.5 font-semibold text-primary"
            >
              {part}
            </span>
          );
        }
        return <span key={idx}>{part}</span>;
      })}
    </span>
  );
}

// Step node component in the visual timeline
function StepNode({
  step,
  stepNumber,
  totalSteps,
  isExpanded,
  onToggle,
}: {
  step: WorkflowStep;
  stepNumber: number;
  totalSteps: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const modelStyle = getModelStyle(step.model);
  const isLast = stepNumber === totalSteps;
  const hasTools = step.tools && (step.tools.enable?.length || step.tools.disable?.length);
  const hasConfig = step.maxRetries !== undefined || step.autoCommit !== undefined;

  return (
    <div className="group relative">
      {/* Connector line to next step */}
      {!isLast && (
        <div className="absolute left-6 top-full z-0 h-8 w-px bg-gradient-to-b from-border to-border/50" />
      )}

      {/* Main node card */}
      <div
        className={cn(
          "relative overflow-hidden border transition-all duration-300",
          isExpanded
            ? "border-primary/50 bg-card shadow-[0_0_30px_rgba(var(--primary),0.1)]"
            : "border-border/50 bg-card/50 hover:border-border hover:bg-card",
        )}
      >
        {/* Grid pattern background */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.015]">
          <div
            className="h-full w-full"
            style={{
              backgroundImage:
                "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
              backgroundSize: "16px 16px",
            }}
          />
        </div>

        {/* Step header - always visible */}
        <button
          onClick={onToggle}
          className="relative flex w-full items-start gap-4 p-4 text-left transition-colors hover:bg-muted/30"
        >
          {/* Step number node */}
          <div className="relative">
            <div
              className={cn(
                "flex h-12 w-12 shrink-0 items-center justify-center border-2 font-semibold transition-all duration-300",
                isExpanded
                  ? "border-primary bg-primary/20 text-primary shadow-[0_0_15px_rgba(var(--primary),0.3)]"
                  : "border-border bg-muted/50 text-muted-foreground group-hover:border-primary/50 group-hover:text-foreground",
              )}
            >
              {stepNumber}
            </div>
            {/* Pulse animation on hover */}
            <div
              className={cn(
                "absolute inset-0 border-2 border-primary opacity-0 transition-opacity duration-300",
                "group-hover:animate-ping group-hover:opacity-30",
              )}
            />
          </div>

          {/* Step info */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-medium text-foreground">{step.name}</h3>
              {/* Model badge */}
              <Badge
                variant="outline"
                className={cn(
                  "shrink-0 border px-1.5 py-0 text-[10px] uppercase tracking-wider",
                  modelStyle.bgColor,
                  modelStyle.borderColor,
                  modelStyle.color,
                )}
              >
                {modelStyle.label}
              </Badge>
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {step.prompt.substring(0, 120)}
              {step.prompt.length > 120 && "..."}
            </p>
            {/* Quick indicators */}
            <div className="mt-2 flex items-center gap-3">
              {hasTools && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Settings className="h-3 w-3" />
                  Tools configured
                </span>
              )}
              {step.autoCommit && (
                <span className="flex items-center gap-1 text-xs text-emerald-400">
                  <Check className="h-3 w-3" />
                  Auto-commit
                </span>
              )}
              {step.maxRetries !== undefined && step.maxRetries > 0 && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Activity className="h-3 w-3" />
                  {step.maxRetries} retries
                </span>
              )}
            </div>
          </div>

          {/* Expand indicator */}
          <div className="shrink-0 pt-2">
            {isExpanded ? (
              <ChevronDown className="h-5 w-5 text-primary" />
            ) : (
              <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            )}
          </div>
        </button>

        {/* Expanded content */}
        {isExpanded && (
          <div className="relative border-t border-border/50 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="p-4 pl-20">
              {/* Full prompt */}
              <div className="mb-4">
                <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Prompt Template
                </h4>
                <div className="border border-border/50 bg-muted/30 p-4">
                  <pre className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                    <HighlightedPrompt text={step.prompt} />
                  </pre>
                </div>
              </div>

              {/* Configuration grid */}
              {step.model && (
                <div className="flex items-center gap-2 text-xs ">
                  <h4 className="font-medium uppercase tracking-wider text-muted-foreground">
                    Model
                  </h4>
                  <p className={cn("font-medium uppercase", modelStyle.color)}>{step.model}</p>
                </div>
              )}

              {/* Tools */}
              {hasTools && (
                <div className="mt-4">
                  <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Tool Configuration
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {step.tools?.enable?.map((tool) => (
                      <Badge
                        key={tool}
                        className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      >
                        + {tool}
                      </Badge>
                    ))}
                    {step.tools?.disable?.map((tool) => (
                      <Badge
                        key={tool}
                        className="border-rose-500/30 bg-rose-500/10 text-rose-400"
                      >
                        - {tool}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Connector arrow to next step */}
      {!isLast && (
        <div className="my-2 flex justify-center">
          <div className="flex h-6 w-6 items-center justify-center border border-border/50 bg-card text-muted-foreground">
            <ChevronDown className="h-3 w-3" />
          </div>
        </div>
      )}
    </div>
  );
}

export function WorkflowDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: workflow, isLoading, error } = useWorkflow(id ?? "");
  const deleteWorkflowMutation = useDeleteWorkflow();
  const exportWorkflowMutation = useExportWorkflow();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set([0])); // First step expanded by default

  const toggleStep = (index: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const expandAll = () => {
    if (workflow) {
      setExpandedSteps(new Set(workflow.definition.steps.map((_, i) => i)));
    }
  };

  const collapseAll = () => {
    setExpandedSteps(new Set());
  };

  const handleBack = () => {
    navigate("/workflows");
  };

  const handleEdit = () => {
    navigate(`/workflows/${id}/edit`);
  };

  const handleClone = () => {
    setCloneDialogOpen(true);
  };

  const handleExport = () => {
    if (!id) return;
    exportWorkflowMutation.mutate(id, {
      onSuccess: () => {
        toast.success("Workflow exported", {
          description: "The workflow has been downloaded as JSON.",
        });
      },
      onError: (err) => {
        toast.error("Failed to export workflow", {
          description: err instanceof Error ? err.message : "An error occurred",
        });
      },
    });
  };

  const handleDelete = async () => {
    if (!workflow) return;

    try {
      await deleteWorkflowMutation.mutateAsync(workflow.id);
      toast.success("Workflow deleted", {
        description: `${workflow.name} has been deleted.`,
      });
      navigate("/workflows");
    } catch (err) {
      toast.error("Failed to delete workflow", {
        description: err instanceof Error ? err.message : "An error occurred",
      });
    }
  };

  const handleCloneSuccess = (newWorkflowId: string) => {
    setCloneDialogOpen(false);
    navigate(`/workflows/${newWorkflowId}/edit`);
  };

  if (isLoading) {
    return (
      <Container className="py-6 lg:py-8">
        <div className="flex flex-col items-center justify-center py-20">
          <div className="relative">
            <div className="h-12 w-12 border-2 border-border" />
            <div className="absolute inset-0 h-12 w-12 animate-spin border-2 border-primary border-t-transparent" />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">Loading workflow...</p>
        </div>
      </Container>
    );
  }

  if (error || !workflow) {
    return (
      <Container className="py-6 lg:py-8">
        <div className="flex flex-col items-center justify-center py-20">
          <div className="flex h-16 w-16 items-center justify-center border border-border bg-muted/50">
            <Workflow className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="mt-4 text-sm font-medium text-foreground">Workflow not found</p>
          <p className="mt-1 text-xs text-muted-foreground">
            The workflow you're looking for doesn't exist or has been deleted.
          </p>
          <Button variant="outline" size="sm" className="mt-6" onClick={handleBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Workflows
          </Button>
        </div>
      </Container>
    );
  }

  // Get unique models used in workflow
  const usedModels = new Set(workflow.definition.steps.map((s) => s.model).filter(Boolean));

  return (
    <Container className="py-6 lg:py-8">
      {/* Navigation */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleBack}
        className="mb-6 -ml-2 h-8 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Workflows
      </Button>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center border border-primary/30 bg-primary/10">
                <Workflow className="h-6 w-6 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">
                    {workflow.name}
                  </h1>
                  {workflow.isBuiltin ? (
                    <Badge
                      variant="secondary"
                      className="shrink-0 text-[10px] uppercase tracking-wider"
                    >
                      System
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="shrink-0 border-primary/30 bg-primary/5 text-[10px] uppercase tracking-wider text-primary"
                    >
                      Custom
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{workflow.description}</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={exportWorkflowMutation.isPending}
            >
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Button variant="outline" size="sm" onClick={handleClone}>
              Clone
            </Button>
            {!workflow.isBuiltin && (
              <>
                <Button variant="outline" size="sm" onClick={handleEdit}>
                  <FileEdit className="mr-2 h-4 w-4" />
                  Edit
                </Button>
                <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Metadata bar */}
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-border/50 py-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Version:</span>
            <span className="font-medium text-foreground">{workflow.definition.version}</span>
          </div>
          <div className="h-3 w-px bg-border" />
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Steps:</span>
            <span className="font-medium text-primary">{workflow.definition.steps.length}</span>
          </div>
          {workflow.definition.model && (
            <>
              <div className="h-3 w-px bg-border" />
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Default Model:</span>
                <span
                  className={cn(
                    "font-medium uppercase",
                    getModelStyle(workflow.definition.model).color,
                  )}
                >
                  {workflow.definition.model}
                </span>
              </div>
            </>
          )}
          {usedModels.size > 0 && (
            <>
              <div className="h-3 w-px bg-border" />
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Models used:</span>
                <div className="flex items-center gap-1.5">
                  {Array.from(usedModels).map((model) => {
                    const style = getModelStyle(model);
                    return (
                      <span key={model} className={cn("font-medium uppercase", style.color)}>
                        {style.label}
                      </span>
                    );
                  })}
                </div>
              </div>
            </>
          )}
          <div className="h-3 w-px bg-border" />
          <div className="flex items-center gap-2 text-xs">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">Updated:</span>
            <span className="font-medium text-foreground">
              {new Date(workflow.updatedAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>

      {/* Steps section */}
      <div className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Workflow Steps
            </h2>
            <div className="h-px w-12 bg-border/50" />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={expandAll} className="h-7 text-xs">
              Expand All
            </Button>
            <Button variant="ghost" size="sm" onClick={collapseAll} className="h-7 text-xs">
              Collapse All
            </Button>
          </div>
        </div>

        {/* Visual flow indicator */}
        <div className="mb-6 flex items-center gap-2 border border-border/50 bg-muted/20 p-3">
          <div className="flex items-center gap-1">
            <Play className="h-4 w-4 text-emerald-400" />
            <span className="text-xs text-muted-foreground">Start</span>
          </div>
          <div className="flex-1 border-t border-dashed border-border" />
          <div className="flex items-center gap-2">
            {workflow.definition.steps.map((step, idx) => {
              const style = getModelStyle(step.model);
              return (
                <TooltipProvider key={idx} delay={100}>
                  <Tooltip>
                    <TooltipTrigger>
                      <button
                        onClick={() => toggleStep(idx)}
                        className={cn(
                          "flex h-6 w-6 items-center justify-center text-xs font-medium transition-all",
                          expandedSteps.has(idx)
                            ? "bg-primary/20 text-primary ring-2 ring-primary/50"
                            : cn(style.bgColor, style.color, "hover:ring-2 hover:ring-border"),
                        )}
                      >
                        {idx + 1}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      {step.name}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })}
          </div>
          <div className="flex-1 border-t border-dashed border-border" />
          <div className="flex items-center gap-1">
            <Check className="h-4 w-4 text-emerald-400" />
            <span className="text-xs text-muted-foreground">Complete</span>
          </div>
        </div>

        {/* Step timeline */}
        <div className="space-y-0">
          {workflow.definition.steps.map((step, index) => (
            <StepNode
              key={`${step.name}-${index}`}
              step={step}
              stepNumber={index + 1}
              totalSteps={workflow.definition.steps.length}
              isExpanded={expandedSteps.has(index)}
              onToggle={() => toggleStep(index)}
            />
          ))}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Workflow</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <strong className="text-foreground">{workflow.name}</strong>?
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This action cannot be undone. Any tasks using this workflow will no longer reference it.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteWorkflowMutation.isPending}
            >
              {deleteWorkflowMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clone Dialog */}
      <CloneWorkflowDialog
        open={cloneDialogOpen}
        onOpenChange={setCloneDialogOpen}
        workflow={workflow}
        onSuccess={handleCloneSuccess}
      />
    </Container>
  );
}
