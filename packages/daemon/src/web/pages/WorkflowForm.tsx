/**
 * Workflow Form Page
 *
 * Create and edit workflows with a form-based interface.
 * Features visual step builder with drag-and-drop reordering and live preview.
 *
 * Design: Technical blueprint aesthetic with interactive step canvas.
 */

import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useForm, useFieldArray, Controller, useWatch } from "react-hook-form";
import {
  useWorkflow,
  useCreateWorkflow,
  useUpdateWorkflow,
  type WorkflowDefinition,
  type WorkflowStep,
} from "@/hooks/useWorkflows";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Container } from "@/components/layout/Container";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Trash2,
  Workflow,
  Activity,
  Check,
  Play,
  Settings,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";

// Available Claude Code tools
const AVAILABLE_TOOLS = [
  { value: "Read", label: "Read", description: "Read files" },
  { value: "Edit", label: "Edit", description: "Edit files" },
  { value: "Write", label: "Write", description: "Write files" },
  { value: "Bash", label: "Bash", description: "Run shell commands" },
  { value: "Glob", label: "Glob", description: "Find files by pattern" },
  { value: "Grep", label: "Grep", description: "Search file contents" },
  { value: "WebFetch", label: "WebFetch", description: "Fetch web content" },
  { value: "WebSearch", label: "WebSearch", description: "Search the web" },
  { value: "Task", label: "Task", description: "Launch subagents" },
  { value: "NotebookEdit", label: "NotebookEdit", description: "Edit Jupyter notebooks" },
  { value: "TodoWrite", label: "TodoWrite", description: "Track tasks" },
  { value: "AskUserQuestion", label: "AskUserQuestion", description: "Ask user questions" },
] as const;

interface WorkflowFormProps {
  mode: "create" | "edit";
}

interface FormStep {
  name: string;
  prompt: string;
  model: string;
  maxRetries: number;
  autoCommit: boolean;
  toolsEnable: string;
  toolsDisable: string;
}

interface FormData {
  name: string;
  description: string;
  version: string;
  model: string;
  steps: FormStep[];
}

const MODEL_OPTIONS = [
  { value: "", label: "Default (inherit)", color: "text-muted-foreground" },
  { value: "haiku", label: "Haiku", color: "text-emerald-400" },
  { value: "sonnet", label: "Sonnet", color: "text-primary" },
  { value: "opus", label: "Opus", color: "text-violet-400" },
];

const DEFAULT_STEP: FormStep = {
  name: "",
  prompt: "",
  model: "",
  maxRetries: 0,
  autoCommit: false,
  toolsEnable: "",
  toolsDisable: "",
};

// Get model styling
function getModelColor(model: string): string {
  const opt = MODEL_OPTIONS.find((o) => o.value === model);
  return opt?.color ?? "text-muted-foreground";
}

// Mini preview component for step flow
function StepFlowPreview({ steps, activeIndex }: { steps: FormStep[]; activeIndex: number }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/20 p-3">
      <div className="flex items-center gap-1">
        <Play className="h-3.5 w-3.5 text-emerald-400" />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Start</span>
      </div>
      <div className="flex-1 border-t border-dashed border-border" />
      <div className="flex items-center gap-1.5">
        {steps.map((step, idx) => {
          const modelColor = getModelColor(step.model);
          const isActive = idx === activeIndex;
          const hasName = step.name.trim().length > 0;
          return (
            <div
              key={idx}
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded text-xs font-medium transition-all",
                isActive
                  ? "bg-primary text-primary-foreground ring-2 ring-primary/50 ring-offset-2 ring-offset-background"
                  : hasName
                    ? cn("bg-muted/50", modelColor)
                    : "border border-dashed border-border bg-transparent text-muted-foreground",
              )}
            >
              {idx + 1}
            </div>
          );
        })}
      </div>
      <div className="flex-1 border-t border-dashed border-border" />
      <div className="flex items-center gap-1">
        <Check className="h-3.5 w-3.5 text-emerald-400" />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">End</span>
      </div>
    </div>
  );
}

// Helper to parse comma-separated tools string into array
function parseToolsString(value: string): string[] {
  if (!value.trim()) return [];
  return value
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

// Helper to convert array back to comma-separated string
function toolsArrayToString(tools: string[]): string {
  return tools.join(", ");
}

// Multi-select component for tools
function ToolsMultiSelect({
  value,
  onChange,
  variant = "enable",
}: {
  value: string;
  onChange: (value: string) => void;
  variant?: "enable" | "disable";
}) {
  const selectedTools = parseToolsString(value);
  const isDisableVariant = variant === "disable";

  const toggleTool = (toolValue: string) => {
    const newSelection = selectedTools.includes(toolValue)
      ? selectedTools.filter((t) => t !== toolValue)
      : [...selectedTools, toolValue];
    onChange(toolsArrayToString(newSelection));
  };

  const clearAll = () => {
    onChange("");
  };

  return (
    <Popover>
      <PopoverTrigger>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "mt-2 h-9 w-full justify-start text-left font-normal bg-muted/30",
            selectedTools.length === 0 && "text-muted-foreground",
          )}
        >
          <span className="truncate text-sm">
            {selectedTools.length === 0
              ? "Select tools..."
              : selectedTools.length === 1
                ? selectedTools[0]
                : `${selectedTools.length} tools selected`}
          </span>
          <ChevronDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <div className="p-1">
          {/* Clear all option */}
          <button
            type="button"
            onClick={clearAll}
            className={cn(
              "flex w-full items-center rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
              selectedTools.length === 0 && "bg-accent",
            )}
          >
            <Check
              className={cn(
                "mr-2 h-4 w-4",
                selectedTools.length === 0 ? "opacity-100" : "opacity-0",
              )}
            />
            None selected
          </button>
          <div className="my-1 h-px bg-border" />

          {/* Tool list */}
          <div className="max-h-[280px] overflow-y-auto">
            {AVAILABLE_TOOLS.map((tool) => {
              const isSelected = selectedTools.includes(tool.value);
              return (
                <button
                  type="button"
                  key={tool.value}
                  onClick={() => toggleTool(tool.value)}
                  className={cn(
                    "flex w-full items-center rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                    isSelected && isDisableVariant && "bg-destructive/10",
                  )}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      isSelected ? "opacity-100" : "opacity-0",
                      isSelected && isDisableVariant && "text-destructive",
                    )}
                  />
                  <div className="flex flex-col items-start">
                    <span className={cn(isSelected && isDisableVariant && "text-destructive")}>
                      {tool.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{tool.description}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected tools summary */}
        {selectedTools.length > 0 && (
          <>
            <div className="h-px bg-border" />
            <div className="flex flex-wrap gap-1 p-2">
              {selectedTools.map((tool) => (
                <Badge
                  key={tool}
                  variant="outline"
                  className={cn(
                    "h-5 px-1.5 text-[10px]",
                    isDisableVariant
                      ? "border-destructive/30 bg-destructive/10 text-destructive"
                      : "border-primary/30 bg-primary/10 text-primary",
                  )}
                >
                  {tool}
                </Badge>
              ))}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

function StepEditor({
  index,
  control,
  register,
  errors,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  isOnly,
  isActive,
  onActivate,
}: {
  index: number;
  control: any;
  register: any;
  errors: any;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  isOnly: boolean;
  isActive: boolean;
  onActivate: () => void;
}) {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  // Watch step values for live preview
  const stepModel = useWatch({ control, name: `steps.${index}.model` });
  const stepName = useWatch({ control, name: `steps.${index}.name` });
  const stepPrompt = useWatch({ control, name: `steps.${index}.prompt` });
  const modelColor = getModelColor(stepModel || "");

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-lg border transition-all duration-300",
        isActive
          ? "border-primary/50 bg-card shadow-[0_0_30px_rgba(var(--primary),0.1)]"
          : "border-border/50 bg-card/50 hover:border-border",
      )}
      onClick={onActivate}
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

      {/* Active indicator */}
      {isActive && <div className="absolute left-0 top-0 h-full w-1 bg-primary" />}

      {/* Header */}
      <div className="relative border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-3">
          {/* Step number */}
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 font-semibold transition-all",
              isActive
                ? "border-primary bg-primary/20 text-primary"
                : "border-border bg-muted/50 text-muted-foreground",
            )}
          >
            {index + 1}
          </div>

          {/* Step name input */}
          <div className="flex-1">
            <Input
              {...register(`steps.${index}.name`, {
                required: "Step name is required",
                minLength: { value: 2, message: "Name must be at least 2 characters" },
              })}
              placeholder="Step name (e.g., Analyze Requirements)"
              className={cn(
                "text-sm font-medium placeholder:text-muted-foreground/50 focus-visible:ring-0",
                stepName ? "text-foreground" : "text-muted-foreground",
              )}
            />
            {errors.steps?.[index]?.name && (
              <p className="mt-1 text-xs text-destructive">{errors.steps[index].name.message}</p>
            )}
          </div>

          {/* Model badge */}
          <Badge
            variant="outline"
            className={cn(
              "shrink-0 rounded border px-2 py-0.5 text-[10px] uppercase tracking-wider",
              stepModel
                ? cn(
                    modelColor,
                    stepModel === "opus" && "border-violet-500/30 bg-violet-500/10",
                    stepModel === "sonnet" && "border-primary/30 bg-primary/10",
                    stepModel === "haiku" && "border-emerald-500/30 bg-emerald-500/10",
                  )
                : "border-border bg-muted/30 text-muted-foreground",
            )}
          >
            {MODEL_OPTIONS.find((o) => o.value === stepModel)?.label || "Default"}
          </Badge>

          {/* Reorder controls */}
          <div className="flex items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onMoveUp();
              }}
              disabled={!canMoveUp}
              title="Move up"
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onMoveDown();
              }}
              disabled={!canMoveDown}
              title="Move down"
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              disabled={isOnly}
              title="Remove step"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Main content - always visible when active */}
      <div className={cn("relative", isActive ? "block" : "hidden")}>
        <div className="space-y-4 p-4">
          {/* Prompt */}
          <div>
            <Label
              htmlFor={`steps.${index}.prompt`}
              className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >
              Prompt Template <span className="text-destructive">*</span>
            </Label>
            <div className="relative mt-2">
              <Textarea
                id={`steps.${index}.prompt`}
                {...register(`steps.${index}.prompt`, {
                  required: "Prompt is required",
                  minLength: { value: 10, message: "Prompt must be at least 10 characters" },
                })}
                placeholder="Enter the prompt for this step. Use {{task}} to reference the task prompt."
                rows={6}
                className="resize-none bg-muted/30 text-sm leading-relaxed"
              />
              {errors.steps?.[index]?.prompt && (
                <p className="mt-1 text-xs text-destructive">
                  {errors.steps[index].prompt.message}
                </p>
              )}
              <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>Use</span>
                <code className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">
                  {"{{prompt}}"}
                </code>
                <span>to reference the task prompt.</span>
              </div>
            </div>
          </div>

          {/* Model selection */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label
                htmlFor={`steps.${index}.model`}
                className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
              >
                Model
              </Label>
              <Controller
                name={`steps.${index}.model`}
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="mt-2 h-9 bg-muted/30">
                      <SelectValue>
                        <span className={getModelColor(field.value)}>
                          {field.value
                            ? MODEL_OPTIONS.find((o) => o.value === field.value)?.label
                            : "Default (inherit)"}
                        </span>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {MODEL_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <span className={opt.color}>{opt.label}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          {/* Advanced options */}
          <Collapsible open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen}>
            <CollapsibleTrigger className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground">
              <Settings className="h-3.5 w-3.5" />
              Advanced Options
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform", isAdvancedOpen && "rotate-180")}
              />
            </CollapsibleTrigger>

            <CollapsibleContent className="mt-4 space-y-4 animate-in fade-in slide-in-from-top-2">
              {/* Auto commit */}
              <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/20 p-3">
                <Controller
                  name={`steps.${index}.autoCommit`}
                  control={control}
                  render={({ field }) => (
                    <Checkbox
                      id={`steps.${index}.autoCommit`}
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
                <div>
                  <Label htmlFor={`steps.${index}.autoCommit`} className="text-sm font-medium">
                    Auto Commit
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically commit changes after this step completes
                  </p>
                </div>
              </div>

              {/* Tools configuration */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label
                    htmlFor={`steps.${index}.toolsEnable`}
                    className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
                  >
                    Enable Tools
                  </Label>
                  <Controller
                    name={`steps.${index}.toolsEnable`}
                    control={control}
                    render={({ field }) => (
                      <ToolsMultiSelect
                        value={field.value}
                        onChange={field.onChange}
                        variant="enable"
                      />
                    )}
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Tools to explicitly enable for this step
                  </p>
                </div>

                <div>
                  <Label
                    htmlFor={`steps.${index}.toolsDisable`}
                    className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
                  >
                    Disable Tools
                  </Label>
                  <Controller
                    name={`steps.${index}.toolsDisable`}
                    control={control}
                    render={({ field }) => (
                      <ToolsMultiSelect
                        value={field.value}
                        onChange={field.onChange}
                        variant="disable"
                      />
                    )}
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Tools to disable for this step
                  </p>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>

      {/* Collapsed preview */}
      {!isActive && (
        <div className="px-4 py-3">
          <p className="line-clamp-1 text-sm text-muted-foreground">
            {stepPrompt?.substring(0, 80) || "No prompt defined..."}
          </p>
        </div>
      )}
    </div>
  );
}

export function WorkflowForm({ mode }: WorkflowFormProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = mode === "edit";

  const { data: existingWorkflow, isLoading: isLoadingWorkflow } = useWorkflow(
    isEdit ? (id ?? "") : "",
  );
  const createWorkflowMutation = useCreateWorkflow();
  const updateWorkflowMutation = useUpdateWorkflow();

  const [activeStepIndex, setActiveStepIndex] = useState(0);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormData>({
    defaultValues: {
      name: "",
      description: "",
      version: "1.0.0",
      model: "",
      steps: [{ ...DEFAULT_STEP }],
    },
  });

  const { fields, append, remove, move } = useFieldArray({
    control,
    name: "steps",
  });

  // Watch all steps for preview
  const watchedSteps = useWatch({ control, name: "steps" }) || [];

  // Load existing workflow data when editing
  useEffect(() => {
    if (isEdit && existingWorkflow) {
      const formSteps: FormStep[] = existingWorkflow.definition.steps.map((step) => ({
        name: step.name,
        prompt: step.prompt,
        model: step.model || "",
        maxRetries: step.maxRetries || 0,
        autoCommit: step.autoCommit || false,
        toolsEnable: step.tools?.enable?.join(", ") || "",
        toolsDisable: step.tools?.disable?.join(", ") || "",
      }));

      reset({
        name: existingWorkflow.name,
        description: existingWorkflow.description,
        version: existingWorkflow.definition.version,
        model: existingWorkflow.definition.model || "",
        steps: formSteps.length > 0 ? formSteps : [{ ...DEFAULT_STEP }],
      });
    }
  }, [isEdit, existingWorkflow, reset]);

  const handleBack = () => {
    if (isEdit && id) {
      navigate(`/workflows/${id}`);
    } else {
      navigate("/workflows");
    }
  };

  const parseToolsList = (input: string): string[] | undefined => {
    if (!input.trim()) return undefined;
    return input
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
  };

  const onSubmit = async (data: FormData) => {
    // Convert form data to workflow definition
    const steps: WorkflowStep[] = data.steps.map((step) => {
      const workflowStep: WorkflowStep = {
        name: step.name,
        prompt: step.prompt,
      };

      if (step.model) {
        workflowStep.model = step.model;
      }

      if (step.maxRetries > 0) {
        workflowStep.maxRetries = step.maxRetries;
      }

      if (step.autoCommit) {
        workflowStep.autoCommit = step.autoCommit;
      }

      const enableTools = parseToolsList(step.toolsEnable);
      const disableTools = parseToolsList(step.toolsDisable);

      if (enableTools || disableTools) {
        workflowStep.tools = {};
        if (enableTools) workflowStep.tools.enable = enableTools;
        if (disableTools) workflowStep.tools.disable = disableTools;
      }

      return workflowStep;
    });

    const definition: WorkflowDefinition = {
      name: data.name,
      description: data.description,
      version: data.version,
      steps,
    };

    if (data.model) {
      definition.model = data.model;
    }

    try {
      if (isEdit && id) {
        await updateWorkflowMutation.mutateAsync({
          id,
          name: data.name,
          description: data.description,
          definition,
        });
        toast.success("Workflow updated", {
          description: `${data.name} has been saved.`,
        });
        navigate(`/workflows/${id}`);
      } else {
        const newWorkflow = await createWorkflowMutation.mutateAsync({
          name: data.name,
          description: data.description,
          definition,
        });
        toast.success("Workflow created", {
          description: `${data.name} has been created.`,
        });
        navigate(`/workflows/${newWorkflow.id}`);
      }
    } catch (err) {
      toast.error(isEdit ? "Failed to update workflow" : "Failed to create workflow", {
        description: err instanceof Error ? err.message : "An error occurred",
      });
    }
  };

  const handleAddStep = useCallback(() => {
    append({ ...DEFAULT_STEP });
    setActiveStepIndex(fields.length);
  }, [append, fields.length]);

  const handleMoveUp = useCallback(
    (index: number) => {
      if (index > 0) {
        move(index, index - 1);
        setActiveStepIndex(index - 1);
      }
    },
    [move],
  );

  const handleMoveDown = useCallback(
    (index: number) => {
      if (index < fields.length - 1) {
        move(index, index + 1);
        setActiveStepIndex(index + 1);
      }
    },
    [move, fields.length],
  );

  const handleRemove = useCallback(
    (index: number) => {
      remove(index);
      if (activeStepIndex >= fields.length - 1) {
        setActiveStepIndex(Math.max(0, fields.length - 2));
      }
    },
    [remove, activeStepIndex, fields.length],
  );

  const isPending = createWorkflowMutation.isPending || updateWorkflowMutation.isPending;

  // Check if we're trying to edit a built-in workflow
  if (isEdit && existingWorkflow?.isBuiltin) {
    return (
      <Container className="py-6 lg:py-8">
        <div className="flex flex-col items-center justify-center py-20">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-muted/50">
            <Workflow className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="mt-4 text-sm font-medium text-foreground">Cannot edit system workflow</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Clone this workflow to create an editable copy
          </p>
          <Button variant="outline" size="sm" className="mt-6" onClick={handleBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </div>
      </Container>
    );
  }

  if (isEdit && isLoadingWorkflow) {
    return (
      <Container className="py-6 lg:py-8">
        <div className="flex flex-col items-center justify-center py-20">
          <div className="relative">
            <div className="h-12 w-12 rounded-full border-2 border-border" />
            <div className="absolute inset-0 h-12 w-12 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">Loading workflow...</p>
        </div>
      </Container>
    );
  }

  return (
    <Container className="py-6 lg:py-8">
      <form onSubmit={handleSubmit(onSubmit)}>
        {/* Navigation */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleBack}
          className="mb-6 -ml-2 h-8 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {isEdit ? "Back to Workflow" : "Back to Workflows"}
        </Button>

        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
              <Workflow className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                {isEdit ? "Edit Workflow" : "Create Workflow"}
              </h1>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {isEdit
                  ? "Update workflow configuration and steps"
                  : "Define a new workflow template for task execution"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleBack}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isEdit ? "Saving..." : "Creating..."}
                </>
              ) : isEdit ? (
                "Save Changes"
              ) : (
                "Create Workflow"
              )}
            </Button>
          </div>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Left column - Basic info */}
          <div className="lg:col-span-1">
            <div className="sticky top-6 space-y-6">
              {/* Basic info card */}
              <div className="rounded-lg border border-border/50 bg-card p-4">
                <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Basic Information
                </h2>

                <div className="space-y-4">
                  <div>
                    <Label htmlFor="name" className="text-xs">
                      Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="name"
                      {...register("name", {
                        required: "Name is required",
                        minLength: { value: 3, message: "Name must be at least 3 characters" },
                      })}
                      placeholder="My Custom Workflow"
                      className="mt-1.5 bg-muted/30"
                    />
                    {errors.name && (
                      <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="description" className="text-xs">
                      Description <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      id="description"
                      {...register("description", {
                        required: "Description is required",
                        minLength: {
                          value: 10,
                          message: "Description must be at least 10 characters",
                        },
                      })}
                      placeholder="Describe what this workflow does..."
                      rows={3}
                      className="mt-1.5 resize-none bg-muted/30 text-sm"
                    />
                    {errors.description && (
                      <p className="mt-1 text-xs text-destructive">{errors.description.message}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="version" className="text-xs">
                        Version
                      </Label>
                      <Input
                        id="version"
                        {...register("version")}
                        placeholder="1.0.0"
                        className="mt-1.5 bg-muted/30"
                      />
                    </div>

                    <div>
                      <Label htmlFor="model" className="text-xs">
                        Default Model
                      </Label>
                      <Controller
                        name="model"
                        control={control}
                        render={({ field }) => (
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger className="mt-1.5 h-9 bg-muted/30">
                              <SelectValue>
                                <span className={getModelColor(field.value)}>
                                  {field.value
                                    ? MODEL_OPTIONS.find((o) => o.value === field.value)?.label
                                    : "Select"}
                                </span>
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {MODEL_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  <span className={opt.color}>{opt.label}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Live preview */}
              <div className="rounded-lg border border-border/50 bg-card p-4">
                <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Workflow Preview
                </h2>
                <StepFlowPreview steps={watchedSteps} activeIndex={activeStepIndex} />
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {fields.length} step{fields.length !== 1 ? "s" : ""}
                  </span>
                  <span>Click a step to edit</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right column - Steps */}
          <div className="lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                  Workflow Steps
                </h2>
                <div className="h-px w-8 bg-border/50" />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddStep}
                className="h-8"
              >
                <Plus className="mr-2 h-3.5 w-3.5" />
                Add Step
              </Button>
            </div>

            {fields.length === 0 && (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 p-12 text-center">
                <Activity className="mx-auto h-10 w-10 text-muted-foreground/50" />
                <p className="mt-3 text-sm text-foreground">No steps defined</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Add at least one step to your workflow
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={handleAddStep}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add First Step
                </Button>
              </div>
            )}

            <div className="space-y-3">
              {fields.map((field, index) => (
                <div key={field.id} className="relative">
                  {/* Connector line */}
                  {index < fields.length - 1 && (
                    <div className="absolute left-5 top-full z-0 h-3 w-px bg-border" />
                  )}
                  <StepEditor
                    index={index}
                    control={control}
                    register={register}
                    errors={errors}
                    onRemove={() => handleRemove(index)}
                    onMoveUp={() => handleMoveUp(index)}
                    onMoveDown={() => handleMoveDown(index)}
                    canMoveUp={index > 0}
                    canMoveDown={index < fields.length - 1}
                    isOnly={fields.length === 1}
                    isActive={activeStepIndex === index}
                    onActivate={() => setActiveStepIndex(index)}
                  />
                </div>
              ))}
            </div>

            {fields.length > 0 && (
              <Button
                type="button"
                variant="outline"
                className="mt-4 w-full border-dashed"
                onClick={handleAddStep}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Another Step
              </Button>
            )}
          </div>
        </div>

        {/* Sticky footer */}
        <div className="sticky bottom-0 mt-8 -mx-4 border-t border-border bg-background/95 px-4 py-4 backdrop-blur-sm xl:-mx-6 xl:px-6">
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              {isDirty ? (
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  Unsaved changes
                </span>
              ) : (
                <span>All changes saved</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={handleBack}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {isEdit ? "Saving..." : "Creating..."}
                  </>
                ) : isEdit ? (
                  "Save Changes"
                ) : (
                  "Create Workflow"
                )}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </Container>
  );
}
