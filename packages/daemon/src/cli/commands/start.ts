/**
 * Start Command
 *
 * Starts the Night Shift daemon with local web server.
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { NIGHTSHIFT_DIR, PID_FILE } from "../../config/paths";
import { ensureNightShiftDirectories } from "../../config/paths";
import { VERSION } from "@nightshift/shared";
import { closeDb, getDbStats, initDb, runMigrations } from "../../db";
import { loadConfig } from "../../config";
import { serverOptions } from "../../server/options";
import { findAvailablePort } from "../../server";
import { type TaskExecutor, createExecutor } from "../../executor";
import { checkForUpdates } from "../../update";

/**
 * Check if daemon is already running
 */
function isDaemonRunning(): boolean {
  if (!existsSync(PID_FILE)) {
    return false;
  }

  try {
    const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);
    // Check if process exists by sending signal 0
    process.kill(pid, 0);
    return true;
  } catch {
    // Process doesn't exist, clean up stale PID file
    return false;
  }
}

/**
 * Write current process PID to file
 */
function writePidFile(): void {
  writeFileSync(PID_FILE, process.pid.toString(), "utf-8");
}

/**
 * Open URL in default browser
 */
async function openBrowser(url: string): Promise<void> {
  const command =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";

  try {
    await Bun.spawn([command, url], { stdio: ["ignore", "ignore", "ignore"] });
  } catch {
    // Silently fail if we can't open browser
    console.error("Could not open browser automatically");
  }
}

/**
 * Start the daemon
 */
export async function startCommand(): Promise<void> {
  // Check if already running
  if (isDaemonRunning()) {
    console.error("Night Shift is already running");
    process.exit(1);
  }

  // Ensure directories exist
  ensureNightShiftDirectories();

  // Load configuration
  console.log("Loading configuration...");
  const config = loadConfig();
  console.log(`Configuration loaded (port: ${config.port}, timeout: ${config.taskTimeoutMs}ms)`);

  // Initialize database
  console.log("Initializing database...");
  initDb();

  // Run migrations
  const migrationResult = await runMigrations();
  if (!migrationResult.success) {
    console.error(`Database migration failed: ${migrationResult.error}`);
    process.exit(1);
  }

  const dbStats = getDbStats();
  console.log(`Database ready with ${dbStats.tables.length} tables`);

  // Find available port (try config.port through config.port + 10)
  let actualPort: number;
  try {
    actualPort = await findAvailablePort(config.port, 11);
    if (actualPort !== config.port) {
      console.log(`Port ${config.port} in use, using port ${actualPort} instead`);
    }
  } catch (error) {
    console.error(`Could not find available port between ${config.port} and ${config.port + 10}`);
    process.exit(1);
  }

  // Write PID file
  writePidFile();

  process.env.PORT = actualPort.toString();

  // Start server with oRPC routes
  const server = Bun.serve({
    ...serverOptions,
    port: actualPort,
  });

  const localUrl = `http://localhost:${actualPort}`;
  console.log(`Night Shift running at ${localUrl}`);
  console.log(`Version: ${VERSION}`);

  // Initialize and start task executor
  let executor: TaskExecutor | null = null;
  if (config.localQueueEnabled) {
    console.log("Starting task executor...");
    executor = createExecutor({
      dataDir: NIGHTSHIFT_DIR,
      timeoutMs: config.taskTimeoutMs,
    });
    executor.start();
    console.log("Task executor started");
  } else {
    console.log("Local queue disabled, task executor not started");
  }

  // Open browser
  await openBrowser(localUrl);

  // Check for updates (async, non-blocking)
  checkForUpdates()
    .then((updateInfo) => {
      if (updateInfo) {
        console.log(`\nUpdate available: v${updateInfo.version}`);
        console.log(`Visit Settings > Updates in the UI to install.`);
      }
    })
    .catch(() => {
      // Silently fail - update check is optional
    });

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log("\nShutting down...");

    // Stop executor first
    if (executor) {
      console.log("Stopping task executor...");
      executor.stop();
    }

    await server.stop();

    // Close database connection
    console.log("Closing database...");
    closeDb();

    // Clean up PID file
    if (existsSync(PID_FILE)) {
      try {
        const fs = await import("fs/promises");
        await fs.unlink(PID_FILE);
      } catch {
        // Ignore errors during cleanup
      }
    }

    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Keep process alive
  await new Promise(() => {});
}
