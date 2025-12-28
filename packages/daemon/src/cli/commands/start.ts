/**
 * Start Command
 *
 * Starts the Night Shift daemon with local web server.
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { networkInterfaces } from "os";
import { getVersionDisplay } from "@nightshift/shared";
import { NIGHTSHIFT_DIR, PID_FILE } from "../../config/paths";
import { ensureNightShiftDirectories } from "../../config/paths";
import { closeDb, getDbStats, initDb, runMigrations } from "../../db";
import { loadConfig } from "../../config";
import { createServerOptions } from "../../orpc/options";
import { findAvailablePort } from "../../orpc/utils";
import { type TaskExecutor, createExecutor } from "../../executor";
import { checkForUpdates } from "../../update";
import {
  setTerminalOutputProvider,
  setTerminalMessagesProvider,
  setTranscriptReader,
} from "../../orpc/router";
import { initWorkflows } from "../../workflows/loader";
import { generatePin, getLocalIpAddress, setPort } from "../../lan";

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
 * Get local IP address for LAN access
 */
function getLocalIpAddress(): string | null {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    const netInterface = nets[name];
    if (!netInterface) continue;
    for (const net of netInterface) {
      // Skip internal (loopback) and non-IPv4 addresses
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return null;
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
 * Parse command line arguments for start command
 */
interface StartCommandArgs {
  interactive: boolean;
}

function parseArgs(args: string[]): StartCommandArgs {
  const options: StartCommandArgs = { interactive: false };

  for (const arg of args) {
    if (arg === "-i" || arg === "--interactive") {
      options.interactive = true;
    } else {
      console.error(`Unknown option: ${arg}`);
      console.error("Usage: nightshift start [-i|--interactive]");
      process.exit(1);
    }
  }

  return options;
}

/**
 * Start the daemon in background (detached mode)
 */
async function startInBackground(): Promise<void> {
  // Get the script path
  const scriptPath = process.argv[1];
  if (!scriptPath) {
    console.error("Could not determine script path");
    process.exit(1);
  }

  // Spawn detached process
  const proc = Bun.spawn(
    [
      process.execPath,
      // bun or compiled binary
      process.execPath.endsWith("/bun") ? scriptPath : "",
      "start",
      "--interactive",
    ].filter(Boolean),
    {
      detached: true,
      stdio: ["ignore", "ignore", "ignore"],
      env: process.env,
    },
  );

  // Unref so parent can exit
  proc.unref();

  // Give it a moment to start
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Verify it started
  if (isDaemonRunning()) {
    console.log("Night Shift started successfully");
    console.log("Run 'nightshift status' to check daemon status");
    console.log("Run 'nightshift config' to open the web UI");
  } else {
    console.error("Failed to start daemon");
    process.exit(1);
  }
}

/**
 * Start the daemon
 */
export async function startCommand(): Promise<void> {
  // Parse arguments
  const args = process.argv.slice(3); // Skip 'bun', 'index.ts', 'start'
  const options = parseArgs(args);

  // Check if already running
  if (isDaemonRunning()) {
    console.error("Night Shift is already running");
    process.exit(1);
  }

  // If not interactive, spawn in background and exit
  if (!options.interactive) {
    await startInBackground();
    return;
  }

  // Interactive mode: run in foreground
  console.log("Starting Night Shift in interactive mode...");

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

  // Load built-in workflows
  console.log("Loading workflows...");
  await initWorkflows();

  // Find available port (try config.port through config.port + 10)
  let actualPort: number;
  try {
    actualPort = await findAvailablePort(config.port, 11);
    if (actualPort !== config.port) {
      console.log(`Port ${config.port} in use, using port ${actualPort} instead`);
    }
  } catch {
    console.error(`Could not find available port between ${config.port} and ${config.port + 10}`);
    process.exit(1);
  }

  // Write PID file
  writePidFile();

  process.env.PORT = actualPort.toString();

  // Set port for LAN URL generation
  setPort(actualPort);

  // Generate PIN and display LAN access info if enabled
  if (config.allowLan) {
    const pin = generatePin();
    const localIp = getLocalIpAddress();

    console.log("");
    console.log("╔══════════════════════════════════════════════════╗");
    console.log("║              LAN ACCESS ENABLED                  ║");
    console.log("╠══════════════════════════════════════════════════╣");
    console.log(`║  PIN: ${pin}                                      ║`);
    if (localIp) {
      const lanUrl = `http://${localIp}:${actualPort}`;
      console.log(`║  Local IP: ${localIp.padEnd(37)}║`);
      console.log(`║  URL: ${lanUrl.padEnd(42)}║`);
    } else {
      console.log("║  Local IP: Not available                         ║");
    }
    console.log("╚══════════════════════════════════════════════════╝");

    // Show Windows firewall hint
    if (process.platform === "win32") {
      console.log("");
      console.log("Tip: If mobile devices can't connect, ensure Windows Firewall");
      console.log(`     allows port ${actualPort}. Run 'nightshift doctor' to check.`);
    }
    console.log("");
  }

  // Create server options with LAN config
  const serverOpts = createServerOptions(config.allowLan);

  // Start server with oRPC routes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const server = Bun.serve({
    ...serverOpts,
    port: actualPort,
    idleTimeout: 255,
  } as any);

  const localUrl = `http://localhost:${actualPort}`;
  const lanIp = getLocalIpAddress();
  const lanUrl = lanIp ? `http://${lanIp}:${actualPort}` : null;

  console.log(`Night Shift running at ${localUrl}`);
  if (lanUrl) {
    console.log(`LAN access: ${lanUrl}`);
  }
  console.log(`Version: ${getVersionDisplay()}`);
  if (config.allowLan) {
    console.log("LAN access: Enabled (see PIN above)");
  }

  // Initialize and start task executor
  let executor: TaskExecutor | null = null;
  if (config.localQueueEnabled) {
    console.log("Starting task executor...");
    executor = createExecutor({
      dataDir: NIGHTSHIFT_DIR,
      timeoutMs: config.taskTimeoutMs,
      maxConcurrentTasks: config.maxConcurrentTasks,
    });

    // Wire up terminal providers for live preview and transcript reading
    setTerminalOutputProvider((taskId) => executor?.getTerminalOutput(taskId) ?? null);
    setTerminalMessagesProvider((taskId) => executor?.getTerminalMessages(taskId) ?? null);
    setTranscriptReader((taskId) => executor?.readTranscript(taskId) ?? []);

    executor.start();
    console.log(`Task executor started (max concurrent tasks: ${config.maxConcurrentTasks})`);
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
