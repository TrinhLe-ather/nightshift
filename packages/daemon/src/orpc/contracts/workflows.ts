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
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  cloneWorkflow,
} from "../../workflows/loader";

// Zod schemas
const workflowSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  isBuiltin: z.boolean(),
  stepCount: z.number(),
  model: z.string().optional(),
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
  model: z.string().optional(),
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
  model: z.string().optional(),
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

// Create a new custom workflow
const create = orpc
  .input(
    z.object({
      name: z.string().min(3, "Name must be at least 3 characters"),
      description: z.string().min(10, "Description must be at least 10 characters"),
      definition: workflowDefinitionSchema,
    }),
  )
  .output(workflowDetailSchema)
  .handler(async ({ input, errors }) => {
    try {
      const record = await createWorkflow(input.name, input.description, {
        name: input.definition.name,
        description: input.definition.description,
        version: input.definition.version,
        model: input.definition.model,
        steps: input.definition.steps,
      });

      const definition = JSON.parse(record.definition);

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
      console.error("[workflows.create] Error:", error);
      throw errors.INTERNAL_SERVER_ERROR({
        message: error instanceof Error ? error.message : "Failed to create workflow",
      });
    }
  });

// Update an existing custom workflow
const update = orpc
  .input(
    z.object({
      id: z.string(),
      name: z.string().min(3, "Name must be at least 3 characters").optional(),
      description: z.string().min(10, "Description must be at least 10 characters").optional(),
      definition: workflowDefinitionSchema.optional(),
    }),
  )
  .output(workflowDetailSchema)
  .handler(async ({ input, errors }) => {
    const { id, ...updates } = input;

    try {
      const record = await updateWorkflow(id, {
        name: updates.name,
        description: updates.description,
        definition: updates.definition
          ? {
              name: updates.definition.name,
              description: updates.definition.description,
              version: updates.definition.version,
              model: updates.definition.model,
              steps: updates.definition.steps,
            }
          : undefined,
      });

      const definition = JSON.parse(record.definition);

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
      if (error instanceof Error) {
        if (error.message === "Workflow not found") {
          throw errors.NOT_FOUND({
            message: "Workflow not found",
            data: { resource: "workflow", id },
          });
        }
        if (error.message === "Cannot update built-in workflow") {
          throw errors.FORBIDDEN({
            message: "Cannot update built-in workflow",
          });
        }
      }
      console.error("[workflows.update] Error:", error);
      throw errors.INTERNAL_SERVER_ERROR({
        message: error instanceof Error ? error.message : "Failed to update workflow",
      });
    }
  });

// Delete a custom workflow
const remove = orpc
  .input(
    z.object({
      id: z.string(),
    }),
  )
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input, errors }) => {
    const { id } = input;

    try {
      await deleteWorkflow(id);
      return { success: true };
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "Workflow not found") {
          throw errors.NOT_FOUND({
            message: "Workflow not found",
            data: { resource: "workflow", id },
          });
        }
        if (error.message === "Cannot delete built-in workflow") {
          throw errors.FORBIDDEN({
            message: "Cannot delete built-in workflow",
          });
        }
        if (error.message.startsWith("Cannot delete workflow in use")) {
          throw errors.CONFLICT({
            message: error.message,
            data: { reason: "workflow_in_use" },
          });
        }
      }
      console.error("[workflows.delete] Error:", error);
      throw errors.INTERNAL_SERVER_ERROR({
        message: error instanceof Error ? error.message : "Failed to delete workflow",
      });
    }
  });

// Clone a workflow to create a custom copy
const clone = orpc
  .input(
    z.object({
      sourceId: z.string(),
      name: z.string().min(3, "Name must be at least 3 characters"),
      description: z.string().optional(),
    }),
  )
  .output(workflowDetailSchema)
  .handler(async ({ input, errors }) => {
    try {
      const record = await cloneWorkflow(input.sourceId, input.name, input.description);

      const definition = JSON.parse(record.definition);

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
      if (error instanceof Error) {
        if (error.message === "Source workflow not found") {
          throw errors.NOT_FOUND({
            message: "Source workflow not found",
            data: { resource: "workflow", id: input.sourceId },
          });
        }
      }
      console.error("[workflows.clone] Error:", error);
      throw errors.INTERNAL_SERVER_ERROR({
        message: error instanceof Error ? error.message : "Failed to clone workflow",
      });
    }
  });

export const workflowsRouter = {
  list,
  get,
  create,
  update,
  delete: remove,
  clone,
};
