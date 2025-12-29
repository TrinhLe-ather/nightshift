/**
 * Workflows Page
 *
 * List and manage workflow templates for task execution.
 * Displays built-in workflows (read-only) and custom workflows (editable).
 *
 * Design: Technical blueprint/schematic aesthetic with precision engineering vibes.
 */

import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkflows, useDeleteWorkflow } from "@/hooks/useWorkflows";
import { cn } from "@/lib/utils";
import { getWorkflowTypeStyle } from "@/lib/status";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal";
import { ButtonGroup } from "@/components/ui/button-group";
import { Container } from "@/components/layout/Container";
import {
  FileEdit,
  FilePlus,
  Loader2,
  Plus,
  Search,
  Trash2,
  Workflow,
  Activity,
} from "@/components/ui/icons";
import { CloneWorkflowDialog } from "@/components/CloneWorkflowDialog";
import { ImportWorkflowDialog } from "@/components/ImportWorkflowDialog";

type FilterCategory = "all" | "builtin" | "custom";

interface WorkflowSummary {
  id: string;
  name: string;
  description: string;
  isBuiltin: boolean;
  stepCount: number;
  model?: string;
}

function WorkflowCard({
  workflow,
  onView,
  onEdit,
  onClone,
  onDelete,
  index,
}: {
  workflow: WorkflowSummary;
  onView: () => void;
  onEdit: () => void;
  onClone: () => void;
  onDelete: () => void;
  index: number;
}) {
  const workflowType = getWorkflowTypeStyle(workflow.name, workflow.description);
  const stepCount = workflow.stepCount;

  return (
    <div
      className={cn(
        "flex flex-col justify-between",
        "group relative cursor-pointer overflow-hidden border bg-card transition-all duration-300",
        "hover:border-primary/50 hover:shadow-[0_0_20px_rgba(var(--primary),0.1)]",
        "animate-in fade-in slide-in-from-bottom-2",
        workflow.isBuiltin ? "border-border" : "border-primary/20",
      )}
      style={{ animationDelay: `${index * 50}ms`, animationFillMode: "both" }}
      onClick={onView}
    >
      {/* Type indicator strip */}
      <div className={cn("absolute left-0 top-0 h-full w-1", workflowType.bgColor)} />

      {/* Header */}
      <div className="relative border-b border-border/50 p-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center",
                  workflowType.bgColor,
                  workflowType.borderColor,
                  "border",
                )}
              >
                <Workflow className={cn("h-3.5 w-3.5", workflowType.color)} />
              </div>
              <h3 className="truncate text-sm font-medium text-foreground">{workflow.name}</h3>
            </div>
            <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {workflow.description}
            </p>
          </div>

          {/* Quick actions - visible on hover */}
          {!workflow.isBuiltin && (
            <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                title="Edit"
              >
                <FileEdit className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="relative flex items-center justify-between gap-2 p-4 pt-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Activity className="h-3 w-3" />
          <span>
            {stepCount} step{stepCount !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="pointer-events-auto relative z-10 h-7 bg-card/80 px-2 text-xs backdrop-blur-sm"
            onClick={(e) => {
              e.stopPropagation();
              onClone();
            }}
          >
            Clone
          </Button>
        </div>
      </div>
    </div>
  );
}

export function Workflows() {
  const navigate = useNavigate();
  const { data: workflowsData, isLoading } = useWorkflows();
  const deleteWorkflowMutation = useDeleteWorkflow();

  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<FilterCategory>("all");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [workflowToDelete, setWorkflowToDelete] = useState<WorkflowSummary | null>(null);
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [workflowToClone, setWorkflowToClone] = useState<WorkflowSummary | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const workflows = useMemo(() => workflowsData?.workflows ?? [], [workflowsData]);

  // Filter workflows based on search and category
  const filteredWorkflows = useMemo(() => {
    return workflows.filter((wf) => {
      const matchesSearch =
        searchQuery === "" ||
        wf.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        wf.description.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCategory =
        filterCategory === "all" ||
        (filterCategory === "builtin" && wf.isBuiltin) ||
        (filterCategory === "custom" && !wf.isBuiltin);

      return matchesSearch && matchesCategory;
    });
  }, [workflows, searchQuery, filterCategory]);

  // Separate built-in and custom workflows
  const builtinWorkflows = filteredWorkflows.filter((wf) => wf.isBuiltin);
  const customWorkflows = filteredWorkflows.filter((wf) => !wf.isBuiltin);

  const handleView = (id: string) => {
    navigate(`/workflows/${id}`);
  };

  const handleEdit = (id: string) => {
    navigate(`/workflows/${id}/edit`);
  };

  const handleClone = (workflow: WorkflowSummary) => {
    setWorkflowToClone(workflow);
    setCloneDialogOpen(true);
  };

  const openDeleteDialog = (workflow: WorkflowSummary) => {
    setWorkflowToDelete(workflow);
    setDeleteDialogOpen(true);
  };

  const closeDeleteDialog = () => {
    setDeleteDialogOpen(false);
    setWorkflowToDelete(null);
  };

  const handleDelete = async () => {
    if (!workflowToDelete) return;

    try {
      await deleteWorkflowMutation.mutateAsync(workflowToDelete.id);
      toast.success("Workflow deleted", {
        description: `${workflowToDelete.name} has been deleted.`,
      });
      closeDeleteDialog();
    } catch (err) {
      toast.error("Failed to delete workflow", {
        description: err instanceof Error ? err.message : "An error occurred",
      });
    }
  };

  const handleCloneSuccess = (newWorkflowId: string) => {
    setCloneDialogOpen(false);
    setWorkflowToClone(null);
    navigate(`/workflows/${newWorkflowId}/edit`);
  };

  return (
    <Container className="py-4 lg:py-6 flex-1 overflow-auto flex flex-col gap-4 lg:gap-6">
      {/* Header with technical aesthetic */}
      <div>
        <div className="flex items-center lg:items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 items-center justify-center border border-primary/30 bg-primary/10 hidden md:flex">
                <Workflow className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-foreground">Workflows</h1>
                <p className="mt-0.5 text-xs text-muted-foreground hidden lg:block">
                  Task execution templates with multi-step orchestration
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-col md:flex-row items-end md:items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setImportDialogOpen(true)}
              className="gap-2"
            >
              <FilePlus className="h-4 w-4" />
              <span>Import</span>
            </Button>
            <Button onClick={() => navigate("/workflows/new")} className="gap-2" size="sm">
              <Plus className="h-4 w-4" />
              <span>New Workflow</span>
            </Button>
          </div>
        </div>

        {/* Stats + Search/Filter row */}
        <div className="mt-4 flex flex-col lg:flex-row flex-wrap items-start lg:items-center justify-between gap-4 border-b border-border/50 py-3">
          {/* Stats - left side */}
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Total:</span>
              <span className="font-medium text-foreground">{workflows.length}</span>
            </div>
            <div className="h-3 w-px bg-border" />
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">System:</span>
              <span className="font-medium text-foreground">
                {workflows.filter((w) => w.isBuiltin).length}
              </span>
            </div>
            <div className="h-3 w-px bg-border" />
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Custom:</span>
              <span className="font-medium text-primary">
                {workflows.filter((w) => !w.isBuiltin).length}
              </span>
            </div>
          </div>

          {/* Search/Filter - right side */}
          <div className="flex flex-wrap lg:justify-end flex-1 lg:ml-auto items-center gap-2">
            <div className="relative w-full min-w-[120px] max-w-full lg:max-w-[240px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search workflows..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 bg-card pl-9 text-sm"
              />
            </div>
            <ButtonGroup>
              <Button
                variant={filterCategory === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterCategory("all")}
                className="h-8 text-xs"
              >
                All
              </Button>
              <Button
                variant={filterCategory === "builtin" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterCategory("builtin")}
                className="h-8 text-xs"
              >
                System
              </Button>
              <Button
                variant={filterCategory === "custom" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterCategory("custom")}
                className="h-8 text-xs"
              >
                Custom
              </Button>
            </ButtonGroup>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="relative">
            <div className="h-12 w-12 border-2 border-border" />
            <div className="absolute inset-0 h-12 w-12 animate-spin border-2 border-primary border-t-transparent" />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">Loading workflows...</p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredWorkflows.length === 0 && (
        <div className="flex flex-col items-center justify-center border border-dashed border-border bg-card/50 py-20">
          <div className="flex h-16 w-16 items-center justify-center border border-border bg-muted/50">
            <Workflow className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="mt-4 text-sm font-medium text-foreground">No workflows found</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {searchQuery || filterCategory !== "all"
              ? "Try adjusting your search or filter"
              : "Create a workflow to get started"}
          </p>
          {!searchQuery && filterCategory === "all" && (
            <Button className="mt-4 lg:mt-6" size="sm" onClick={() => navigate("/workflows/new")}>
              <Plus className="mr-2 h-4 w-4" />
              Create Your First Workflow
            </Button>
          )}
        </div>
      )}

      {/* Workflows Grid */}
      {!isLoading && filteredWorkflows.length > 0 && (
        <div className="space-y-6 lg:space-y-8">
          {/* Built-in Workflows Section */}
          {builtinWorkflows.length > 0 && (
            <section>
              <div className="mb-4 flex items-center gap-3">
                <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                  System Workflows
                </h2>
                <div className="h-px flex-1 bg-border/50" />
                <span className="text-xs text-muted-foreground">{builtinWorkflows.length}</span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {builtinWorkflows.map((workflow, index) => (
                  <WorkflowCard
                    key={workflow.id}
                    workflow={workflow}
                    index={index}
                    onView={() => handleView(workflow.id)}
                    onEdit={() => handleEdit(workflow.id)}
                    onClone={() => handleClone(workflow)}
                    onDelete={() => openDeleteDialog(workflow)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Custom Workflows Section */}
          {customWorkflows.length > 0 && (
            <section>
              <div className="mb-4 flex items-center gap-3">
                <h2 className="text-sm font-medium uppercase tracking-wider text-primary">
                  Custom Workflows
                </h2>
                <div className="h-px flex-1 bg-primary/20" />
                <span className="text-xs text-primary">{customWorkflows.length}</span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {customWorkflows.map((workflow, index) => (
                  <WorkflowCard
                    key={workflow.id}
                    workflow={workflow}
                    index={index}
                    onView={() => handleView(workflow.id)}
                    onEdit={() => handleEdit(workflow.id)}
                    onClone={() => handleClone(workflow)}
                    onDelete={() => openDeleteDialog(workflow)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Empty Custom Workflows Prompt */}
          {customWorkflows.length === 0 &&
            builtinWorkflows.length > 0 &&
            filterCategory !== "builtin" && (
              <section>
                <div className="mb-4 flex items-center gap-3">
                  <h2 className="text-sm font-medium uppercase tracking-wider text-primary">
                    Custom Workflows
                  </h2>
                  <div className="h-px flex-1 bg-primary/20" />
                </div>
                <div className="border border-dashed border-primary/30 bg-primary/5 p-8 text-center">
                  <p className="text-sm text-foreground">No custom workflows yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Clone a system workflow or create a new one
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 border-primary/30 text-primary hover:bg-primary/10"
                    onClick={() => navigate("/workflows/new")}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Create Custom Workflow
                  </Button>
                </div>
              </section>
            )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDeleteDialog();
        }}
      >
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Delete Workflow</ModalTitle>
            <ModalDescription>
              Are you sure you want to delete{" "}
              <strong className="text-foreground">{workflowToDelete?.name}</strong>?
            </ModalDescription>
          </ModalHeader>
          <ModalBody>
            <p className="text-sm text-muted-foreground">
              This action cannot be undone. Any tasks using this workflow will no longer reference
              it.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={closeDeleteDialog}>
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
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Clone Workflow Dialog */}
      <CloneWorkflowDialog
        open={cloneDialogOpen}
        onOpenChange={setCloneDialogOpen}
        workflow={workflowToClone}
        onSuccess={handleCloneSuccess}
      />

      {/* Import Workflow Dialog */}
      <ImportWorkflowDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onSuccess={(id) => {
          setImportDialogOpen(false);
          navigate(`/workflows/${id}/edit`);
        }}
      />
    </Container>
  );
}
