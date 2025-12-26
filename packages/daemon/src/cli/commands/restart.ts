/**
 * Restart Command
 *
 * Gracefully restarts the Night Shift daemon.
 */

import { existsSync, readFileSync } from "fs";
import { PID_FILE } from "../../config/paths";

/**
 * Check if daemon is running
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
    // Process doesn't exist
    return false;
  }
}

/**
 * Stop the daemon
 */
async function stopDaemon(): Promise<boolean> {
  if (!existsSync(PID_FILE)) {
    return true; // Already stopped
  }

  try {
    const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);

    // Check if process exists
    try {
      process.kill(pid, 0);
    } catch {
      // Process not running, clean up PID file
      const fs = await import("fs/promises");
      if (existsSync(PID_FILE)) {
        await fs.unlink(PID_FILE);
      }
      return true;
    }

    // Send SIGTERM to gracefully shutdown
    console.log("Stopping Night Shift...");
    process.kill(pid, "SIGTERM");

    // Wait for process to exit (max 5 seconds)
    const maxWait = 5000;
    const checkInterval = 100;
    let waited = 0;

    while (waited < maxWait) {
      try {
        process.kill(pid, 0);
        await Bun.sleep(checkInterval);
        waited += checkInterval;
      } catch {
        // Process has exited
        break;
      }
    }

    // Check if process is still running
    try {
      process.kill(pid, 0);
      console.error("Failed to stop Night Shift (timeout)");
      console.error("Try: kill -9 " + pid);
      return false;
    } catch {
      // Process has exited successfully
      console.log("Night Shift stopped");
    }

    // Clean up PID file
    if (existsSync(PID_FILE)) {
      const fs = await import("fs/promises");
      await fs.unlink(PID_FILE);
    }

    return true;
  } catch (error) {
    console.error("Error stopping daemon:", error);
    return false;
  }
}

/**
 * Start the daemon in background
 */
async function startDaemon(interactive: boolean): Promise<boolean> {
  // Get the script path
  const scriptPath = process.argv[1];
  if (!scriptPath) {
    console.error("Could not determine script path");
    return false;
  }

  console.log("Starting Night Shift...");

  // Spawn detached process
  const proc = Bun.spawn(
    [
      process.execPath,
      // bun or compiled binary
      process.execPath.endsWith("/bun") ? scriptPath : "",
      "start",
      interactive ? "--interactive" : "--interactive", // Always interactive for restart
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
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Verify it started
  if (isDaemonRunning()) {
    console.log("Night Shift restarted successfully");
    console.log("Run 'nightshift status' to check daemon status");
    console.log("Run 'nightshift config' to open the web UI");
    return true;
  } else {
    console.error("Failed to start daemon");
    return false;
  }
}

/**
 * Parse command line arguments for restart command
 */
interface RestartCommandArgs {
  interactive: boolean;
}

function parseArgs(args: string[]): RestartCommandArgs {
  const options: RestartCommandArgs = { interactive: false };

  for (const arg of args) {
    if (arg === "-i" || arg === "--interactive") {
      options.interactive = true;
    } else {
      console.error(`Unknown option: ${arg}`);
      console.error("Usage: nightshift restart [-i|--interactive]");
      process.exit(1);
    }
  }

  return options;
}

/**
 * Restart the daemon
 */
export async function restartCommand(): Promise<void> {
  // Parse arguments
  const args = process.argv.slice(3); // Skip 'bun', 'index.ts', 'restart'
  const options = parseArgs(args);

  // Check if running
  const wasRunning = isDaemonRunning();

  if (wasRunning) {
    // Stop the daemon
    const stopped = await stopDaemon();
    if (!stopped) {
      console.error("Failed to stop daemon");
      process.exit(1);
    }

    // Wait a bit before restarting
    await Bun.sleep(500);
  } else {
    console.log("Night Shift is not running, starting it now...");
  }

  // Start the daemon
  const started = await startDaemon(options.interactive);
  if (!started) {
    process.exit(1);
  }
}
