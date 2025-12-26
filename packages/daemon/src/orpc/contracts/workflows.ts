/**
 * Workflows oRPC Contract
 *
 * Type-safe API definitions for workflow management.
 * Handles workflow listing and retrieval.
 */

import { z } from "zod";
import { orpc } from "../base";
import {
  listWorkflows,
  getWorkflow,
  getWorkflowRecord,
  type WorkflowDefinition,
} from "../../workflows/loader";

// Zod schemas
const workflowSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  isBuiltin: z.boolean(),
});

const workflowInputSchema = z.object({
  type: z.enum(["string", "number", "boolean", "enum"]),
  description: z.string(),
  required: z.boolean(),
  default: z.unknown().optional(),
  values: z.array(z.string()).optional(),
});

const workflowStepSchema = z.object({
  name: z.string(),
  prompt: z.string(),
  tools: z
    .object({
      enable: z.array(z.string()).optional(),
      disable: z.array(z.string()).optional(),
    })
    .optional(),
  maxRetries: z.number().optional(),
  autoCommit: z.boolean().optional(),
});

const workflowDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  version: z.string(),
  inputs: z.record(z.string(), workflowInputSchema).optional(),
  steps: z.array(workflowStepSchema),
});

const workflowDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  definition: workflowDefinitionSchema,
  isBuiltin: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// List all available workflows
const list = orpc
  .input(z.object({}))
  .output(
    z.object({
      workflows: z.array(workflowSummarySchema),
    }),
  )
  .handler(async () => {
    try {
      const workflows = await listWorkflows();
      return {
        workflows,
      };
    } catch (error) {
      console.error("[workflows.list] Error:", error);
      return {
        workflows: [],
      };
    }
  });

// Get workflow definition by ID
const get = orpc
  .input(
    z.object({
      id: z.string(),
    }),
  )
  .output(workflowDetailSchema)
  .handler(async ({ input, errors }) => {
    const { id } = input;

    try {
      const [definition, record] = await Promise.all([getWorkflow(id), getWorkflowRecord(id)]);

      if (!definition || !record) {
        throw errors.NOT_FOUND({
          message: "Workflow not found",
          data: { resource: "workflow", id },
        });
      }

      return {
        id: record.id,
        name: record.name,
        description: record.description || "",
        definition,
        isBuiltin: record.isBuiltin ?? false,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      };
    } catch (error) {
      if (error && typeof error === "object" && "code" in error) {
        throw error; // Re-throw oRPC errors
      }
      console.error("[workflows.get] Error:", error);
      throw errors.INTERNAL_SERVER_ERROR({
        message: "Failed to retrieve workflow",
      });
    }
  });

export const workflowsRouter = {
  list,
  get,
};
