/**
 * Import Workflow Dialog
 *
 * Dialog for importing a workflow from a JSON file.
 */

import { useState, useRef } from "react";
import { useImportWorkflow, type WorkflowDefinition } from "@/hooks/useWorkflows";
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
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle, Check, Activity } from "@/components/ui/icons";

interface ImportWorkflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (newWorkflowId: string) => void;
}

interface ParsedWorkflow {
  definition: WorkflowDefinition;
  isValid: boolean;
}

export function ImportWorkflowDialog({ open, onOpenChange, onSuccess }: ImportWorkflowDialogProps) {
  const importWorkflowMutation = useImportWorkflow();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileContent, setFileContent] = useState<string | null>(null);
  const [parsedWorkflow, setParsedWorkflow] = useState<ParsedWorkflow | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [nameOverride, setNameOverride] = useState("");

  const handleClose = () => {
    onOpenChange(false);
    setFileContent(null);
    setParsedWorkflow(null);
    setParseError(null);
    setNameOverride("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setFileContent(null);
      setParsedWorkflow(null);
      setParseError(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setFileContent(content);

      // Try to parse and validate
      try {
        const parsed = JSON.parse(content);

        // Basic validation
        if (!parsed.name || typeof parsed.name !== "string") {
          throw new Error("Missing or invalid 'name' field");
        }
        if (!parsed.description || typeof parsed.description !== "string") {
          throw new Error("Missing or invalid 'description' field");
        }
        if (!parsed.version || typeof parsed.version !== "string") {
          throw new Error("Missing or invalid 'version' field");
        }
        if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
          throw new Error("Missing or empty 'steps' array");
        }

        // Validate each step has required fields
        for (let i = 0; i < parsed.steps.length; i++) {
          const step = parsed.steps[i];
          if (!step.name || typeof step.name !== "string") {
            throw new Error(`Step ${i + 1}: Missing or invalid 'name' field`);
          }
          if (!step.prompt || typeof step.prompt !== "string") {
            throw new Error(`Step ${i + 1}: Missing or invalid 'prompt' field`);
          }
        }

        setParsedWorkflow({
          definition: parsed as WorkflowDefinition,
          isValid: true,
        });
        setParseError(null);
      } catch (err) {
        setParsedWorkflow(null);
        setParseError(err instanceof Error ? err.message : "Invalid JSON format");
      }
    };
    reader.onerror = () => {
      setParseError("Failed to read file");
    };
    reader.readAsText(file);
  };

  const handleSubmit = async () => {
    if (!fileContent || !parsedWorkflow) return;

    try {
      const newWorkflow = await importWorkflowMutation.mutateAsync({
        content: fileContent,
        name: nameOverride.trim() || undefined,
      });

      toast.success("Workflow imported", {
        description: `${newWorkflow.name} has been created.`,
      });

      handleClose();

      if (onSuccess) {
        onSuccess(newWorkflow.id);
      }
    } catch (err) {
      toast.error("Failed to import workflow", {
        description: err instanceof Error ? err.message : "An error occurred",
      });
    }
  };

  const canSubmit = parsedWorkflow?.isValid && !importWorkflowMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Import Workflow</DialogTitle>
          <DialogDescription>
            Import a workflow from a JSON file. The workflow will be created as a custom workflow.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* File Input */}
          <div>
            <Label htmlFor="import-file">
              Workflow File <span className="text-destructive">*</span>
            </Label>
            <Input
              ref={fileInputRef}
              id="import-file"
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="mt-1 cursor-pointer"
            />
            <p className="mt-1 text-xs text-muted-foreground">Select a JSON workflow file to import</p>
          </div>

          {/* Parse Error */}
          {parseError && (
            <div className="flex items-start gap-2 border border-destructive/50 bg-destructive/10 p-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div>
                <p className="text-sm font-medium text-destructive">Invalid workflow file</p>
                <p className="mt-0.5 text-xs text-destructive/80">{parseError}</p>
              </div>
            </div>
          )}

          {/* Preview */}
          {parsedWorkflow && (
            <div className="border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{parsedWorkflow.definition.name}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {parsedWorkflow.definition.description}
                  </p>
                  <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Activity className="h-3 w-3" />
                      {parsedWorkflow.definition.steps.length} step
                      {parsedWorkflow.definition.steps.length !== 1 ? "s" : ""}
                    </span>
                    {parsedWorkflow.definition.version && (
                      <span>v{parsedWorkflow.definition.version}</span>
                    )}
                    {parsedWorkflow.definition.model && (
                      <span className="uppercase">{parsedWorkflow.definition.model}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Name Override */}
          {parsedWorkflow && (
            <div>
              <Label htmlFor="import-name">Name Override</Label>
              <Input
                id="import-name"
                value={nameOverride}
                onChange={(e) => setNameOverride(e.target.value)}
                placeholder={parsedWorkflow.definition.name}
                className="mt-1"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Optional: Give the imported workflow a different name
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {importWorkflowMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              "Import Workflow"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
