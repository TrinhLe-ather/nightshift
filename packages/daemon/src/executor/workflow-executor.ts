/**
 * Workflow Executor
 *
 * Executes predefined workflow steps in a single streaming session.
 * Uses StreamingWorkflowRunner for continuous context preservation
 * across all workflow steps.
 */

import type { Task } from "@nightshift/shared";
import { SessionManager } from "./session-manager";
import { StreamingWorkflowRunner } from "./streaming-workflow-runner";
import {
  getWorkflow,
  type WorkflowDefinition,
  createSmartCommitStep,
} from "../workflows/loader";
import { updateTask } from "../tasks/repository";
import { getDb, workflowRuns as workflowRunsTable } from "../db/drizzle";
import { eq } from "drizzle-orm";
import { TaskState, EventType, EventLevel } from "@nightshift/shared";

export class WorkflowExecutor {
  private currentWorkflow: WorkflowDefinition | null = null;
  private streamingRunner: StreamingWorkflowRunner | null = null;

  constructor(private sessionManager: SessionManager) {}

  /**
   * Execute a workflow task using streaming input mode
   */
  async executeWorkflow(task: Task): Promise<void> {
    if (!task.workflowId) {
      throw new Error("Task has no workflow ID");
    }

    const workflow = await getWorkflow(task.workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${task.workflowId} not found`);
    }

    this.currentWorkflow = workflow;

    console.log(`[Workflow] Executing ${workflow.name} for task ${task.id}`);

    // Start session
    this.sessionManager.startSession(task.id);

    // Create workflow run record
    const runId = this.createWorkflowRun(task.id, task.workflowId);

    // Auto-append smart commit step
    const steps = [...workflow.steps];
    const smartCommitStep = createSmartCommitStep(task.prompt);
    steps.push(smartCommitStep);

    // Update task with initial state
    updateTask(task.id, {
      status: TaskState.RUNNING,
      startedAt: new Date().toISOString(),
      currentStep: 0,
      totalSteps: steps.length,
    });

    // Track step results for workflow run record
    const stepResultsRecord: Record<string, string> = {};

    // Create streaming runner
    this.streamingRunner = new StreamingWorkflowRunner(this.sessionManager);

    // Execute workflow with streaming input mode
    const result = await this.streamingRunner.executeWorkflow({
      task,
      steps,
      workflow,
      workDir: task.workDir || task.repoPath || process.cwd(),
      timeout: 30 * 60 * 1000, // 30 minutes for entire workflow

      onStepStarted: (index, name) => {
        console.log(`[Workflow] Step ${index + 1}/${steps.length}: ${name}`);
        updateTask(task.id, { currentStep: index + 1 });

        this.sessionManager.emit(EventType.WORKFLOW_STEP_STARTED, EventLevel.INFO, {
          step: name,
          stepIndex: index + 1,
          totalSteps: steps.length,
        });
      },

      onStepCompleted: (index, stepResult) => {
        console.log(`[Workflow] Step ${index + 1} completed: ${stepResult.stepName}`);

        this.sessionManager.emit(EventType.WORKFLOW_STEP_COMPLETED, EventLevel.INFO, {
          step: stepResult.stepName,
          stepIndex: index + 1,
        });

        // Store result for workflow run record
        stepResultsRecord[stepResult.stepName] = stepResult.output;

        // Update workflow run with progress
        this.updateWorkflowRun(runId, {
          stepResults: JSON.stringify(stepResultsRecord),
          completedSteps: index + 1,
        });
      },

      onStepFailed: (index, error) => {
        const stepName = steps[index]?.name || `Step ${index + 1}`;
        console.error(`[Workflow] Step ${stepName} failed:`, error);

        this.sessionManager.emit(EventType.WORKFLOW_STEP_FAILED, EventLevel.ERROR, {
          step: stepName,
          error,
        });
      },
    });

    // Handle result
    if (!result.success) {
      await this.failWorkflow(task.id, result.error || "Workflow failed");
      return;
    }

    // All steps complete
    await this.completeWorkflow(task.id);
  }

  /**
   * Create a workflow run record
   */
  private createWorkflowRun(taskId: string, workflowId: string): string {
    const db = getDb();
    const id = `wfrun_${crypto.randomUUID()}`;

    db.insert(workflowRunsTable)
      .values({
        id,
        workflowId,
        taskId,
        completedSteps: 0,
      })
      .run();

    return id;
  }

  /**
   * Update a workflow run record
   */
  private updateWorkflowRun(
    runId: string,
    updates: Partial<{ stepResults: string; completedSteps: number }>
  ) {
    const db = getDb();
    db.update(workflowRunsTable).set(updates).where(eq(workflowRunsTable.id, runId)).run();
  }

  /**
   * Complete workflow execution
   * Note: Task completion (marking as COMPLETED, git operations, session cleanup) is handled by TaskExecutor
   */
  private async completeWorkflow(_taskId: string): Promise<void> {
    // Workflow completed successfully
    // TaskExecutor will handle git operations, task completion, and session cleanup
  }

  /**
   * Check if workflow handled git operations (commit/push/PR)
   * Always returns true since Smart Commit step is auto-appended
   */
  public hasHandledGitOps(): boolean {
    return true;
  }

  /**
   * Mark workflow as failed
   * Note: Session cleanup is handled by TaskExecutor
   */
  private async failWorkflow(taskId: string, reason: string): Promise<void> {
    updateTask(taskId, {
      status: TaskState.FAILED,
      failureCode: "WORKFLOW_STEP_FAILED",
      completedAt: new Date().toISOString(),
    });

    this.sessionManager.emit(EventType.TASK_FAILED, EventLevel.ERROR, {
      reason,
    });

    // Session cleanup is handled by TaskExecutor's finally block
  }

  /**
   * Abort the workflow execution
   */
  abort(): void {
    this.streamingRunner?.abort();
  }
}
