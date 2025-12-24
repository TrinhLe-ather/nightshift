import { z } from "zod";
import { loadConfig, saveConfig } from "../../config";
import { orpc } from "../base";

// Zod schemas
const SafeConfigSchema = z.object({
  port: z.number(),
  taskTimeoutMs: z.number(),
  localQueueEnabled: z.boolean(),
  serverUrl: z.string().nullable(),
  maxConcurrentTasks: z.number(),
  scheduleStart: z.string().nullable(),
  scheduleEnd: z.string().nullable(),
});

const ConfigUpdateSchema = z.object({
  port: z.number().int().min(1024).max(65535).optional(),
  taskTimeoutMs: z.number().int().min(60000).optional(),
  localQueueEnabled: z.boolean().optional(),
  maxConcurrentTasks: z.number().int().min(1).max(10).optional(),
  scheduleStart: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional(),
  scheduleEnd: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional(),
});

// GET handler
const get = orpc.output(SafeConfigSchema).handler(async () => {
  const config = loadConfig();

  // Don't expose sensitive fields
  return {
    port: config.port,
    taskTimeoutMs: config.taskTimeoutMs,
    localQueueEnabled: config.localQueueEnabled,
    serverUrl: config.serverUrl || null,
    maxConcurrentTasks: config.maxConcurrentTasks,
    scheduleStart: config.scheduleStart || null,
    scheduleEnd: config.scheduleEnd || null,
  };
});

// UPDATE handler
const update = orpc
  .input(ConfigUpdateSchema)
  .output(SafeConfigSchema)
  .handler(async ({ input, errors }) => {
    const currentConfig = loadConfig();

    // Build updates object
    const updates: Record<string, unknown> = {};

    if (input.port !== undefined) {
      updates.port = input.port;
    }

    if (input.taskTimeoutMs !== undefined) {
      updates.taskTimeoutMs = input.taskTimeoutMs;
    }

    if (input.localQueueEnabled !== undefined) {
      updates.localQueueEnabled = input.localQueueEnabled;
    }

    if (input.maxConcurrentTasks !== undefined) {
      updates.maxConcurrentTasks = input.maxConcurrentTasks;
    }

    if (input.scheduleStart !== undefined) {
      updates.scheduleStart = input.scheduleStart === null ? undefined : input.scheduleStart;
    }

    if (input.scheduleEnd !== undefined) {
      updates.scheduleEnd = input.scheduleEnd === null ? undefined : input.scheduleEnd;
    }

    if (Object.keys(updates).length === 0) {
      throw errors.BAD_REQUEST({ message: "No valid updates provided" });
    }

    const newConfig = { ...currentConfig, ...updates };
    saveConfig(newConfig);

    // Return safe config
    return {
      port: newConfig.port,
      taskTimeoutMs: newConfig.taskTimeoutMs,
      localQueueEnabled: newConfig.localQueueEnabled,
      serverUrl: newConfig.serverUrl || null,
      maxConcurrentTasks: newConfig.maxConcurrentTasks,
      scheduleStart: newConfig.scheduleStart || null,
      scheduleEnd: newConfig.scheduleEnd || null,
    };
  });

export const configRouter = {
  get,
  update,
};
