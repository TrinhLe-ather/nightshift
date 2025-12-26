/**
 * Workflow Executor
 *
 * Executes predefined workflow steps sequentially.
 * Supports template interpolation, step tracking, and error handling.
 */

import type { Task } from "@nightshift/shared";
import { SdkRunner } from "./sdk";
import { SessionManager } from "./session-manager";
import { getWorkflow, type WorkflowDefinition, type WorkflowStep } from "../workflows/loader";
import { updateTask, getTaskById } from "../tasks/repository";
import { getDb, workflowRuns as workflowRunsTable } from "../db/drizzle";
import { eq } from "drizzle-orm";
import { TaskState, EventType, EventLevel } from "@nightshift/shared";

export class WorkflowExecutor {
  constructor(private sessionManager: SessionManager) {}

  /**
   * Execute a workflow task
   */
  async executeWorkflow(task: Task): Promise<void> {
    if (!task.workflowId) {
      throw new Error("Task has no workflow ID");
    }

    const workflow = await getWorkflow(task.workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${task.workflowId} not found`);
    }

    console.log(`[Workflow] Executing ${workflow.name} for task ${task.id}`);

    // Start session
    this.sessionManager.startSession(task.id);

    // Create workflow run record
    const runId = this.createWorkflowRun(task.id, task.workflowId);

    // Update task
    updateTask(task.id, {
      status: TaskState.RUNNING,
      startedAt: new Date().toISOString(),
      currentStep: 0,
      totalSteps: workflow.steps.length,
    });

    // Execute steps sequentially
    const stepResults: Record<string, unknown> = {};

    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i]!;

      console.log(`[Workflow] Step ${i + 1}/${workflow.steps.length}: ${step.name}`);

      // Update current step
      updateTask(task.id, { currentStep: i + 1 });

      this.sessionManager.emit(EventType.WORKFLOW_STEP_STARTED, EventLevel.INFO, {
        step: step.name,
        stepIndex: i + 1,
        totalSteps: workflow.steps.length,
      });

      // Execute step
      try {
        const result = await this.executeStep(task, step, stepResults);
        stepResults[step.name] = result;

        this.sessionManager.emit(EventType.WORKFLOW_STEP_COMPLETED, EventLevel.INFO, {
          step: step.name,
          stepIndex: i + 1,
        });

        // Update workflow run
        this.updateWorkflowRun(runId, {
          stepResults: JSON.stringify(stepResults),
          completedSteps: i + 1,
        });
      } catch (error) {
        console.error(`[Workflow] Step ${step.name} failed:`, error);

        this.sessionManager.emit(EventType.WORKFLOW_STEP_FAILED, EventLevel.ERROR, {
          step: step.name,
          error: error instanceof Error ? error.message : "Unknown error",
        });

        // Fail the workflow
        await this.failWorkflow(task.id, `Failed at step: ${step.name}`);
        return;
      }
    }

    // All steps complete
    await this.completeWorkflow(task.id);
  }

  /**
   * Execute a single workflow step
   */
  private async executeStep(
    task: Task,
    step: WorkflowStep,
    previousResults: Record<string, unknown>,
  ): Promise<unknown> {
    // Map workflow inputs from task data
    // For simple.yml: {{task}} should resolve to task.prompt
    const workflowInputs = {
      task: task.prompt, // Map 'task' input to prompt field
      prompt: task.prompt, // Also support {{prompt}} for flexibility
      repoPath: task.repoPath,
      branch: task.branch,
      ...previousResults, // Previous step results take precedence
    };

    // Interpolate prompt with workflow inputs and task metadata
    const prompt = this.interpolatePrompt(step.prompt, workflowInputs);

    // Run Claude for this step
    const runner = new SdkRunner(this.sessionManager);

    const result = await runner.run({
      prompt,
      workDir: task.workDir || task.repoPath || process.cwd(),
      timeout: 30 * 60 * 1000, // 30 minutes
      sdkSessionId: task.sdkSessionId,
      permissionMode: "acceptEdits", // Workflows always auto-yes
      enableCheckpointing: true,
    });

    // Store SDK session ID for continuation
    if (result.sdkSessionId) {
      updateTask(task.id, { sdkSessionId: result.sdkSessionId });
    }

    if (!result.success) {
      throw new Error(result.error || "Step execution failed");
    }

    return {
      output: result.output,
      checkpointId: result.checkpointId,
    };
  }

  /**
   * Simple Mustache-style template interpolation
   * Replaces {{key}} with data[key]
   */
  private interpolatePrompt(template: string, data: Record<string, unknown>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      const value = data[key];
      return value !== undefined ? String(value) : match;
    });
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
    updates: Partial<{ stepResults: string; completedSteps: number }>,
  ) {
    const db = getDb();
    db.update(workflowRunsTable)
      .set(updates)
      .where(eq(workflowRunsTable.id, runId))
      .run();
  }

  /**
   * Mark workflow as completed
   */
  private async completeWorkflow(taskId: string): Promise<void> {
    updateTask(taskId, {
      status: TaskState.COMPLETED,
      completedAt: new Date().toISOString(),
    });

    this.sessionManager.emit(EventType.TASK_COMPLETED, EventLevel.INFO, {
      taskId,
    });

    this.sessionManager.endSession();
  }

  /**
   * Mark workflow as failed
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

    this.sessionManager.endSession();
  }
}
