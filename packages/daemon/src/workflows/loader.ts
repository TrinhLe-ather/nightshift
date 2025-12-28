/**
 * Workflow Loader Module
 *
 * Loads and manages workflow definitions from YAML files.
 * Handles both built-in workflows and custom user workflows.
 */

import { eq } from "drizzle-orm";
import { getDb, workflows as workflowsTable } from "../db/drizzle";
import type { Workflow, NewWorkflow } from "../db/drizzle";

// Import built-in workflows directly (Bun will bundle them)
import quickTaskYaml from "../../workflows/quick-task.yml";
import investigateAndFixYaml from "../../workflows/investigate-and-fix.yml";
import qualityRefactorYaml from "../../workflows/quality-refactor.yml";
import featureImplementationYaml from "../../workflows/feature-implementation.yml";
import testGenerationYaml from "../../workflows/test-generation.yml";
import codeReviewYaml from "../../workflows/code-review.yml";
import documentationGeneratorYaml from "../../workflows/documentation-generator.yml";
import securityAuditYaml from "../../workflows/security-audit.yml";
import performanceOptimizationYaml from "../../workflows/performance-optimization.yml";
import dependencyUpgradeYaml from "../../workflows/dependency-upgrade.yml";
import apiIntegrationYaml from "../../workflows/api-integration.yml";

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Complete workflow definition parsed from YAML
 */
export interface WorkflowDefinition {
  name: string;
  description: string;
  version: string;
  model?: string;
  steps: WorkflowStep[];
}

/**
 * Individual workflow step definition
 *
 * Step-level model overrides are supported via the SDK's dynamic setModel() API.
 * This allows each step to use a different model while maintaining full context
 * preservation across the streaming session.
 */
export interface WorkflowStep {
  name: string;
  prompt: string;
  model?: string; // Override model for this specific step (e.g., "opus", "sonnet", "haiku")
  tools?: {
    enable?: string[];
    disable?: string[];
  };
  maxRetries?: number;
}

/**
 * Creates a smart commit step that reviews changes and commits intelligently
 *
 * Uses haiku model for cost-efficiency since commit operations are straightforward.
 */
export function createSmartCommitStep(_taskPrompt: string): WorkflowStep {
  return {
    name: "Smart Commit",
    model: "haiku",
    prompt: `You are a Git expert. Review the changes made during this task and create an intelligent commit with PR.

INSTRUCTIONS:
1. Run 'git status' to see what changed
2. Run 'git diff' to understand the changes (limit output if too large)
3. Analyze the changes and understand what was accomplished
4. Create a professional commit message following conventional commits:
   - Format: "type: brief description"
   - Types: feat, fix, refactor, docs, test, chore
   - Keep subject under 50 chars
   - Add detailed body explaining what and why (not how)
5. Stage all changes: git add -A
6. Commit with your generated message: git commit -m "message"
7. Push to remote: git push -u origin HEAD
8. Create PR using gh CLI (if available): gh pr create --title "title" --body "body" --base main

COMMIT MESSAGE GUIDELINES:
- Subject: imperative mood, lowercase, no period, <50 chars
- Body: explain what changed and why
- Include "Task: [original task request]" in body

PR DESCRIPTION GUIDELINES:
- Clear summary of changes
- Link to any relevant context
- List key changes as bullets

If any git operation fails, explain what happened and why.`,
  };
}

/**
 * Workflow summary for listing
 */
export interface WorkflowSummary {
  id: string;
  name: string;
  description: string;
  isBuiltin: boolean;
  stepCount: number;
  model?: string;
}

// ============================================================================
// Built-in Workflow Definitions
// ============================================================================

/**
 * All built-in workflows with their IDs
 * These are imported directly and bundled by Bun
 */
const BUILTIN_WORKFLOWS = [
  // Core workflows
  { id: "quick-task", definition: quickTaskYaml as WorkflowDefinition },
  { id: "investigate-and-fix", definition: investigateAndFixYaml as WorkflowDefinition },
  { id: "quality-refactor", definition: qualityRefactorYaml as WorkflowDefinition },
  // Feature development
  { id: "feature-implementation", definition: featureImplementationYaml as WorkflowDefinition },
  // Testing & Quality
  { id: "test-generation", definition: testGenerationYaml as WorkflowDefinition },
  { id: "code-review", definition: codeReviewYaml as WorkflowDefinition },
  // Documentation
  { id: "documentation-generator", definition: documentationGeneratorYaml as WorkflowDefinition },
  // Security & Performance
  { id: "security-audit", definition: securityAuditYaml as WorkflowDefinition },
  { id: "performance-optimization", definition: performanceOptimizationYaml as WorkflowDefinition },
  // Maintenance
  { id: "dependency-upgrade", definition: dependencyUpgradeYaml as WorkflowDefinition },
  { id: "api-integration", definition: apiIntegrationYaml as WorkflowDefinition },
];

// ============================================================================
// Workflow Loading
// ============================================================================

/**
 * Load all built-in workflows and upsert to database
 *
 * Imports are resolved at build time by Bun, so this works in both
 * dev mode and compiled binaries.
 *
 * @returns Number of workflows loaded
 */
export async function loadBuiltinWorkflows(): Promise<number> {
  const db = getDb();
  let loadedCount = 0;

  for (const { id, definition } of BUILTIN_WORKFLOWS) {
    try {
      // Validate basic structure
      if (!definition.name || !definition.version || !Array.isArray(definition.steps)) {
        console.warn(`[workflows] Skipping invalid workflow: ${id}`);
        continue;
      }

      // Check if workflow exists
      const existing = await db
        .select()
        .from(workflowsTable)
        .where(eq(workflowsTable.id, id))
        .get();

      const now = new Date().toISOString();
      const workflowData: NewWorkflow = {
        id,
        name: definition.name,
        description: definition.description || "",
        definition: JSON.stringify(definition),
        model: definition.model || null,
        isBuiltin: true,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };

      if (existing) {
        // Update existing workflow
        await db.update(workflowsTable).set(workflowData).where(eq(workflowsTable.id, id));
      } else {
        // Insert new workflow
        await db.insert(workflowsTable).values(workflowData);
      }

      loadedCount++;
    } catch (error) {
      console.error(`[workflows] Error loading workflow ${id}:`, error);
    }
  }

  console.log(`[workflows] Loaded ${loadedCount} built-in workflow(s)`);
  return loadedCount;
}

/**
 * Get a specific workflow by ID
 *
 * @param id - Workflow ID
 * @returns Workflow definition or null if not found
 */
export async function getWorkflow(id: string): Promise<WorkflowDefinition | null> {
  const db = getDb();

  try {
    const workflow = await db.select().from(workflowsTable).where(eq(workflowsTable.id, id)).get();

    if (!workflow) {
      return null;
    }

    return JSON.parse(workflow.definition) as WorkflowDefinition;
  } catch (error) {
    console.error(`[workflows] Error getting workflow ${id}:`, error);
    return null;
  }
}

/**
 * Get workflow database record by ID
 *
 * @param id - Workflow ID
 * @returns Workflow record or null if not found
 */
export async function getWorkflowRecord(id: string): Promise<Workflow | null> {
  const db = getDb();

  try {
    const workflow = await db.select().from(workflowsTable).where(eq(workflowsTable.id, id)).get();

    return workflow || null;
  } catch (error) {
    console.error(`[workflows] Error getting workflow record ${id}:`, error);
    return null;
  }
}

/**
 * List all workflows
 *
 * @returns Array of workflow summaries
 */
export async function listWorkflows(): Promise<WorkflowSummary[]> {
  const db = getDb();

  try {
    const workflows = await db.select().from(workflowsTable).all();

    return workflows.map((w) => {
      // Parse definition to get step count
      let stepCount = 0;
      let model: string | undefined;
      try {
        const def = JSON.parse(w.definition) as WorkflowDefinition;
        stepCount = def.steps?.length ?? 0;
        model = def.model;
      } catch {
        // Ignore parse errors
      }

      return {
        id: w.id,
        name: w.name,
        description: w.description || "",
        isBuiltin: w.isBuiltin ?? false,
        stepCount,
        model,
      };
    });
  } catch (error) {
    console.error("[workflows] Error listing workflows:", error);
    return [];
  }
}

/**
 * Initialize workflows on daemon startup
 *
 * Loads all built-in workflows into the database.
 */
export async function initWorkflows(): Promise<void> {
  console.log("[workflows] Initializing workflows...");
  await loadBuiltinWorkflows();
}

// ============================================================================
// Custom Workflow CRUD Operations
// ============================================================================

/**
 * Generate a unique workflow ID for custom workflows
 */
function generateWorkflowId(): string {
  return `wf_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`;
}

/**
 * Create a new custom workflow
 *
 * @param name - Workflow name
 * @param description - Workflow description
 * @param definition - Workflow definition
 * @returns Created workflow record
 */
export async function createWorkflow(
  name: string,
  description: string,
  definition: WorkflowDefinition,
): Promise<Workflow> {
  const db = getDb();
  const id = generateWorkflowId();
  const now = new Date().toISOString();

  const workflowData: NewWorkflow = {
    id,
    name,
    description,
    definition: JSON.stringify(definition),
    model: definition.model || null,
    isBuiltin: false,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(workflowsTable).values(workflowData);

  const created = await db.select().from(workflowsTable).where(eq(workflowsTable.id, id)).get();

  if (!created) {
    throw new Error("Failed to create workflow");
  }

  return created;
}

/**
 * Update an existing custom workflow
 *
 * @param id - Workflow ID
 * @param updates - Fields to update
 * @returns Updated workflow record
 * @throws Error if workflow is built-in or not found
 */
export async function updateWorkflow(
  id: string,
  updates: {
    name?: string;
    description?: string;
    definition?: WorkflowDefinition;
  },
): Promise<Workflow> {
  const db = getDb();

  // Get existing workflow
  const existing = await db.select().from(workflowsTable).where(eq(workflowsTable.id, id)).get();

  if (!existing) {
    throw new Error("Workflow not found");
  }

  if (existing.isBuiltin) {
    throw new Error("Cannot update built-in workflow");
  }

  const now = new Date().toISOString();

  const updateData: Partial<NewWorkflow> = {
    updatedAt: now,
  };

  if (updates.name !== undefined) {
    updateData.name = updates.name;
  }

  if (updates.description !== undefined) {
    updateData.description = updates.description;
  }

  if (updates.definition !== undefined) {
    updateData.definition = JSON.stringify(updates.definition);
    updateData.model = updates.definition.model || null;
  }

  await db.update(workflowsTable).set(updateData).where(eq(workflowsTable.id, id));

  const updated = await db.select().from(workflowsTable).where(eq(workflowsTable.id, id)).get();

  if (!updated) {
    throw new Error("Failed to update workflow");
  }

  return updated;
}

/**
 * Delete a custom workflow
 *
 * @param id - Workflow ID
 * @throws Error if workflow is built-in, not found, or in use by tasks
 */
export async function deleteWorkflow(id: string): Promise<void> {
  const db = getDb();

  // Get existing workflow
  const existing = await db.select().from(workflowsTable).where(eq(workflowsTable.id, id)).get();

  if (!existing) {
    throw new Error("Workflow not found");
  }

  if (existing.isBuiltin) {
    throw new Error("Cannot delete built-in workflow");
  }

  // Check if workflow is in use by any tasks
  const { tasks: tasksTable } = await import("../db/drizzle");
  const tasksUsingWorkflow = await db
    .select({ id: tasksTable.id })
    .from(tasksTable)
    .where(eq(tasksTable.workflowId, id))
    .all();

  if (tasksUsingWorkflow.length > 0) {
    throw new Error(`Cannot delete workflow in use by ${tasksUsingWorkflow.length} task(s)`);
  }

  await db.delete(workflowsTable).where(eq(workflowsTable.id, id));
}

/**
 * Clone an existing workflow to create a custom copy
 *
 * @param sourceId - Source workflow ID to clone
 * @param name - Name for the new workflow
 * @param description - Optional description (defaults to source description)
 * @returns Created workflow record
 */
export async function cloneWorkflow(
  sourceId: string,
  name: string,
  description?: string,
): Promise<Workflow> {
  const db = getDb();

  // Get source workflow
  const source = await db
    .select()
    .from(workflowsTable)
    .where(eq(workflowsTable.id, sourceId))
    .get();

  if (!source) {
    throw new Error("Source workflow not found");
  }

  const sourceDefinition = JSON.parse(source.definition) as WorkflowDefinition;

  // Create new definition with updated name/description
  const newDefinition: WorkflowDefinition = {
    ...sourceDefinition,
    name,
    description: description ?? sourceDefinition.description,
  };

  return createWorkflow(name, description ?? source.description ?? "", newDefinition);
}
