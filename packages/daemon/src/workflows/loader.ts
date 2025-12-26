/**
 * Workflow Loader Module
 *
 * Loads and manages workflow definitions from YAML files.
 * Handles both built-in workflows and custom user workflows.
 */

import { eq } from "drizzle-orm";
import { getDb, workflows as workflowsTable } from "../db/drizzle/index.js";
import type { Workflow, NewWorkflow } from "../db/drizzle/index.js";

// Import built-in workflows directly (Bun will bundle them)
import bugFixYaml from "../../workflows/bug-fix.yml";
import documentationYaml from "../../workflows/documentation.yml";
import prReviewYaml from "../../workflows/pr-review.yml";
import refactorYaml from "../../workflows/refactor.yml";
import simpleYaml from "../../workflows/simple.yml";

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
  inputs?: Record<string, WorkflowInput>;
  steps: WorkflowStep[];
}

/**
 * Workflow input parameter definition
 */
export interface WorkflowInput {
  type: "string" | "number" | "boolean" | "enum";
  description: string;
  required: boolean;
  default?: unknown;
  values?: string[]; // For enum type
}

/**
 * Individual workflow step definition
 */
export interface WorkflowStep {
  name: string;
  prompt: string;
  tools?: {
    enable?: string[];
    disable?: string[];
  };
  maxRetries?: number;
  autoCommit?: boolean;
}

/**
 * Workflow summary for listing
 */
export interface WorkflowSummary {
  id: string;
  name: string;
  description: string;
  isBuiltin: boolean;
}

// ============================================================================
// Built-in Workflow Definitions
// ============================================================================

/**
 * All built-in workflows with their IDs
 * These are imported directly and bundled by Bun
 */
const BUILTIN_WORKFLOWS = [
  { id: "simple", definition: simpleYaml as WorkflowDefinition },
  { id: "bug-fix", definition: bugFixYaml as WorkflowDefinition },
  { id: "documentation", definition: documentationYaml as WorkflowDefinition },
  { id: "pr-review", definition: prReviewYaml as WorkflowDefinition },
  { id: "refactor", definition: refactorYaml as WorkflowDefinition },
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
        isBuiltin: true,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };

      if (existing) {
        // Update existing workflow
        await db
          .update(workflowsTable)
          .set(workflowData)
          .where(eq(workflowsTable.id, id));
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
    const workflow = await db
      .select()
      .from(workflowsTable)
      .where(eq(workflowsTable.id, id))
      .get();

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
    const workflow = await db
      .select()
      .from(workflowsTable)
      .where(eq(workflowsTable.id, id))
      .get();

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

    return workflows.map((w) => ({
      id: w.id,
      name: w.name,
      description: w.description || "",
      isBuiltin: w.isBuiltin ?? false,
    }));
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
