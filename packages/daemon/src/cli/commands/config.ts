/**
 * Config Command
 *
 * Opens the settings page in the browser.
 * Requires daemon to be running.
 */

import { existsSync, readFileSync } from "fs";
import { PID_FILE } from "../../config/paths";
import { getConfigValue } from "../../config";

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
 * Open URL in default browser
 */
async function openBrowser(url: string): Promise<void> {
  const command =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";

  try {
    await Bun.spawn([command, url], { stdio: ["ignore", "ignore", "ignore"] });
  } catch {
    console.error("Could not open browser automatically");
    console.log(`Please open manually: ${url}`);
  }
}

/**
 * Config command handler
 * Opens the settings page in the browser
 */
export async function configCommand(): Promise<void> {
  // Check if daemon is running
  if (!isDaemonRunning()) {
    console.error("Night Shift is not running");
    console.error("Start it with: nightshift start");
    process.exit(1);
  }

  // Get port from config
  const port = getConfigValue("port");
  const settingsUrl = `http://localhost:${port}/settings`;

  console.log(`Opening settings page: ${settingsUrl}`);
  await openBrowser(settingsUrl);
}
