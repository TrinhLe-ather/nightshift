/**
 * Status Command
 *
 * Shows daemon status and active tasks.
 */

import { existsSync, readFileSync } from "fs";
import { DEFAULT_PORT, LOCAL_URL, PID_FILE } from "../../config/paths";
import { VERSION } from "@nightshift/shared";

/**
 * Get daemon status
 */
export async function statusCommand(): Promise<void> {
  // Check if PID file exists
  if (!existsSync(PID_FILE)) {
    console.log("Status: Not running");
    return;
  }

  try {
    // Read PID from file
    const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);

    // Check if process exists
    try {
      process.kill(pid, 0);

      // Process exists, daemon is running
      console.log("Status: Running");
      console.log(`Port: ${DEFAULT_PORT}`);
      console.log(`URL: ${LOCAL_URL}`);
      console.log(`PID: ${pid}`);
      console.log(`Version: ${VERSION}`);

      // TODO: Once SQLite integration is complete, check for active tasks
      // For now, we just show "None"
      console.log("Active task: None");
    } catch {
      // Process doesn't exist
      console.log("Status: Not running (stale PID file)");

      // Clean up stale PID file
      const fs = await import("fs/promises");
      await fs.unlink(PID_FILE);
    }
  } catch (error) {
    console.error("Error checking status:", error);
    process.exit(1);
  }
}
