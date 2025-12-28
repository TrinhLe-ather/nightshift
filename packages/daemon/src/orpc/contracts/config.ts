import { z } from "zod";
import { updateChannelSchema, themeSchema } from "@nightshift/shared";
import { loadConfig, saveConfig } from "../../config";
import { getAvailableShells } from "../../terminal/shells";
import { scheduleRestart } from "../../update";
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
  allowLan: z.boolean(),
  terminalShell: z.string(),
  updateChannel: updateChannelSchema,
  theme: themeSchema,
});

const configUpdateSchema = z.object({
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
  allowLan: z.boolean().optional(),
  terminalShell: z.string().optional(),
  updateChannel: updateChannelSchema.optional(),
  theme: themeSchema.optional(),
});

const ShellInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
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
    allowLan: config.allowLan ?? false,
    terminalShell: config.terminalShell ?? "auto",
    updateChannel: config.updateChannel ?? "stable",
    theme: config.theme ?? "dark",
  };
});

// GET available shells
const getShells = orpc.output(z.array(ShellInfoSchema)).handler(async () => {
  return getAvailableShells();
});

// UPDATE handler with optional restart
const configUpdateWithRestartSchema = configUpdateSchema.extend({
  restart: z.boolean().optional(),
});

const update = orpc
  .input(configUpdateWithRestartSchema)
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

    if (input.allowLan !== undefined) {
      updates.allowLan = input.allowLan;
    }

    if (input.terminalShell !== undefined) {
      updates.terminalShell = input.terminalShell;
    }

    if (input.updateChannel !== undefined) {
      updates.updateChannel = input.updateChannel;
    }

    if (input.theme !== undefined) {
      updates.theme = input.theme;
    }

    if (Object.keys(updates).length === 0) {
      throw errors.BAD_REQUEST({ message: "No valid updates provided" });
    }

    const newConfig = { ...currentConfig, ...updates };
    saveConfig(newConfig);

    // Schedule restart if requested
    if (input.restart) {
      setTimeout(async () => {
        await scheduleRestart();
      }, 500);
    }

    // Return safe config
    return {
      port: newConfig.port,
      taskTimeoutMs: newConfig.taskTimeoutMs,
      localQueueEnabled: newConfig.localQueueEnabled,
      serverUrl: newConfig.serverUrl || null,
      maxConcurrentTasks: newConfig.maxConcurrentTasks,
      scheduleStart: newConfig.scheduleStart || null,
      scheduleEnd: newConfig.scheduleEnd || null,
      allowLan: newConfig.allowLan ?? false,
      terminalShell: newConfig.terminalShell ?? "auto",
      updateChannel: newConfig.updateChannel ?? "stable",
      theme: newConfig.theme ?? "dark",
    };
  });

// Restart daemon endpoint
const restart = orpc.output(z.object({ restarting: z.boolean() })).handler(async () => {
  setTimeout(async () => {
    await scheduleRestart();
  }, 500);
  return { restarting: true };
});

export const configRouter = {
  get,
  getShells,
  update,
  restart,
};
