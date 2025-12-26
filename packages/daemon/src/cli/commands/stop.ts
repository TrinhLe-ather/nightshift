/**
 * Stop Command
 *
 * Gracefully stops the Night Shift daemon.
 */

import { existsSync, readFileSync } from "fs";
import { PID_FILE } from "../../config/paths";

/**
 * Stop the daemon
 */
export async function stopCommand(): Promise<void> {
  // Check if PID file exists
  if (!existsSync(PID_FILE)) {
    console.log("Night Shift is not running");
    return;
  }

  try {
    // Read PID from file
    const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);

    // Check if process exists
    try {
      process.kill(pid, 0);
    } catch {
      console.log("Night Shift is not running (stale PID file)");
      // Clean up stale PID file
      const fs = await import("fs/promises");
      await fs.unlink(PID_FILE);
      return;
    }

    // Send SIGTERM to gracefully shutdown
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
      process.exit(1);
    } catch {
      // Process has exited successfully
      console.log("Night Shift stopped");
    }

    // Clean up PID file
    if (existsSync(PID_FILE)) {
      const fs = await import("fs/promises");
      await fs.unlink(PID_FILE);
    }
  } catch (error) {
    console.error("Error stopping daemon:", error);
    process.exit(1);
  }
}
