import { z } from "zod";
import { count, eq, sql } from "drizzle-orm";
import { VERSION } from "@nightshift/shared";
import { getDb, getDbStats, repos, tasks } from "../../db/drizzle";
import { loadConfig } from "../../config";
import { orpc } from "../base";
import {
  isLanModeActive,
  getLocalIpAddress,
  getLanUrlWithPin,
  getTailscaleIpAddress,
  getTailscaleUrlWithPin,
} from "../../lan";

// Track daemon start time
const startTime = Date.now();

// Zod schemas
const ActiveTaskSchema = z
  .object({
    id: z.string(),
    prompt: z.string(),
    repoPath: z.string().nullable(),
    startedAt: z.string(),
    elapsedMs: z.number(),
  })
  .nullable();

const StatsSchema = z.object({
  pending: z.number(),
  running: z.number(),
  paused: z.number(),
  completed: z.number(),
  failed: z.number(),
  repoCount: z.number(),
});

const LanInfoSchema = z.object({
  enabled: z.boolean(),
  localIp: z.string().nullable(),
  url: z.string().nullable(),
  tailscale: z
    .object({
      ip: z.string().nullable(),
      url: z.string().nullable(),
    })
    .optional(),
});

const DaemonStatusSchema = z.object({
  running: z.boolean(),
  version: z.string(),
  mode: z.enum(["standalone", "connected", "hybrid"]),
  port: z.number(),
  uptime: z.number(),
  database: z.object({
    schemaVersion: z.number(),
    latestMigrationHash: z.string().nullable(),
    latestMigrationCreatedAt: z.union([z.number(), z.string()]).nullable(),
    tables: z.array(z.string()),
  }),
  activeTask: ActiveTaskSchema,
  stats: StatsSchema,
  lan: LanInfoSchema.optional(),
});

// Handler
const getStatus = orpc.output(DaemonStatusSchema).handler(async () => {
  const config = loadConfig();
  const dbStats = getDbStats();
  const db = getDb();

  // Get active task (running status)
  const activeTaskRow = db
    .select({
      id: tasks.id,
      prompt: tasks.prompt,
      repoPath: tasks.repoPath,
      startedAt: tasks.startedAt,
    })
    .from(tasks)
    .where(eq(tasks.status, "running"))
    .limit(1)
    .get();

  let activeTask: z.infer<typeof ActiveTaskSchema> = null;
  if (activeTaskRow && activeTaskRow.startedAt) {
    const startedAt = new Date(activeTaskRow.startedAt);
    activeTask = {
      id: activeTaskRow.id,
      prompt:
        activeTaskRow.prompt.length > 100
          ? activeTaskRow.prompt.substring(0, 100) + "..."
          : activeTaskRow.prompt,
      repoPath: activeTaskRow.repoPath,
      startedAt: startedAt.toISOString(),
      elapsedMs: Date.now() - startedAt.getTime(),
    };
  }

  // Get task stats using SQL aggregation
  const statsRow = db
    .select({
      pending: sql<number>`COUNT(CASE WHEN ${tasks.status} = 'pending' THEN 1 END)`,
      running: sql<number>`COUNT(CASE WHEN ${tasks.status} = 'running' THEN 1 END)`,
      paused: sql<number>`COUNT(CASE WHEN ${tasks.status} IN ('paused', 'needs_human') THEN 1 END)`,
      completed: sql<number>`COUNT(CASE WHEN ${tasks.status} = 'completed' THEN 1 END)`,
      failed: sql<number>`COUNT(CASE WHEN ${tasks.status} = 'failed' THEN 1 END)`,
    })
    .from(tasks)
    .get();

  // Get repo count
  const repoCountRow = db.select({ count: count() }).from(repos).get();

  // Determine mode based on config
  const mode: z.infer<typeof DaemonStatusSchema>["mode"] = config.serverUrl
    ? config.localQueueEnabled
      ? "hybrid"
      : "connected"
    : "standalone";

  // Build LAN info if enabled
  const lanEnabled = isLanModeActive();
  const tailscaleIp = getTailscaleIpAddress();
  const lan = lanEnabled
    ? {
        enabled: true,
        localIp: getLocalIpAddress(),
        url: getLanUrlWithPin(),
        tailscale: tailscaleIp
          ? {
              ip: tailscaleIp,
              url: getTailscaleUrlWithPin(),
            }
          : undefined,
      }
    : undefined;

  return {
    running: true,
    version: VERSION,
    mode,
    port: config.port,
    uptime: Date.now() - startTime,
    database: {
      schemaVersion: dbStats.schemaVersion,
      latestMigrationHash: dbStats.latestMigrationHash,
      latestMigrationCreatedAt: dbStats.latestMigrationCreatedAt,
      tables: dbStats.tables,
    },
    activeTask,
    stats: {
      pending: statsRow?.pending ?? 0,
      running: statsRow?.running ?? 0,
      paused: statsRow?.paused ?? 0,
      completed: statsRow?.completed ?? 0,
      failed: statsRow?.failed ?? 0,
      repoCount: repoCountRow?.count ?? 0,
    },
    lan,
  };
});

export const statusRouter = {
  getStatus,
};
