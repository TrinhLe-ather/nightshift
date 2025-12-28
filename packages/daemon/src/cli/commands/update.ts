/**
 * Update Command
 *
 * Check for updates and install if available.
 */

import { VERSION } from "@nightshift/shared";
import {
  checkForUpdates,
  fetchRelease,
  getLastCheckTime,
  getUpdateState,
  getCachedUpdateInfo,
} from "../../update/version-checker";
import { downloadUpdate } from "../../update/downloader";
import { installUpdate, hasActiveTask, scheduleRestart } from "../../update/installer";

/**
 * Format relative time for display
 */
function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

/**
 * Show update help
 */
function showHelp(): void {
  console.log(`
Usage: nightshift update [target] [options]

Check for updates and install if available.

Arguments:
  target          Version to install (default: latest)
                  Examples: latest, stable, 0.1.0, v0.1.0

Options:
  --check, -c     Check for updates only (don't install)
  --force, -f     Skip confirmation and install immediately
  --status, -s    Show current version and last check info
  --help, -h      Show this help message

Examples:
  nightshift update           # Check and install latest
  nightshift update --check   # Just check, don't install
  nightshift update --status  # Show current version info
  nightshift update --force   # Install without confirmation
  nightshift update 0.2.0     # Install specific version
  nightshift update v0.2.0    # Install specific version (with v prefix)
`);
}

/**
 * Show status information
 */
function showStatus(): void {
  const lastCheck = getLastCheckTime();
  const state = getUpdateState();

  console.log(`Current version: ${VERSION}`);
  console.log(`Last check: ${lastCheck ? formatRelativeTime(lastCheck) : "never"}`);

  if (state.availableVersion) {
    console.log(`Available: ${state.availableVersion}`);
    if (state.publishedAt) {
      console.log(`Published: ${formatRelativeTime(state.publishedAt)}`);
    }
  } else {
    console.log("Status: up to date");
  }
}

/**
 * Check if string is a version target (matches install.sh pattern)
 */
function isVersionTarget(arg: string): boolean {
  if (arg === "latest" || arg === "stable") return true;
  // Match version patterns: 0.1.0, v0.1.0, 1.0.0-beta.1, etc.
  return /^v?[0-9]+\.[0-9]+\.[0-9]+(-[^\s]+)?$/.test(arg);
}

/**
 * Main update command
 */
export async function updateCommand(): Promise<void> {
  const args = process.argv.slice(3);

  // Parse flags
  const checkOnly = args.includes("--check") || args.includes("-c");
  const force = args.includes("--force") || args.includes("-f");
  const statusOnly = args.includes("--status") || args.includes("-s");
  const help = args.includes("--help") || args.includes("-h");

  // Parse target version (first non-flag argument)
  const target = args.find((arg) => !arg.startsWith("-") && isVersionTarget(arg));

  if (help) {
    showHelp();
    return;
  }

  if (statusOnly) {
    showStatus();
    return;
  }

  // Show current version
  console.log(`Current version: ${VERSION}`);

  // Check for active tasks first
  if (!checkOnly) {
    const hasActive = await hasActiveTask();
    if (hasActive) {
      console.error("Cannot update while a task is running.");
      console.error(
        "Please wait for the task to complete or use --check to just check for updates.",
      );
      process.exit(1);
    }
  }

  // Check for updates (or fetch specific version)
  console.log(target ? `Fetching version ${target}...` : "Checking for updates...");

  let updateInfo;
  if (target && target !== "latest" && target !== "stable") {
    // Fetch specific version
    updateInfo = await fetchRelease(target);
    if (!updateInfo) {
      console.error(`Version ${target} not found or no binary available for this platform.`);
      process.exit(1);
    }
  } else {
    // Check for latest updates
    updateInfo = await checkForUpdates();

    if (!updateInfo) {
      // Check if we have a cached update (network error case)
      const cached = getCachedUpdateInfo();
      if (cached) {
        console.log(`Update available: ${cached.version} (cached)`);
      } else {
        console.log("You're running the latest version.");
      }
      return;
    }
  }

  console.log(`Update available: ${updateInfo.version}`);
  if (updateInfo.publishedAt) {
    console.log(`Published: ${formatRelativeTime(updateInfo.publishedAt)}`);
  }

  if (updateInfo.releaseNotes) {
    console.log("\nRelease notes:");
    console.log(updateInfo.releaseNotes.slice(0, 500));
    if (updateInfo.releaseNotes.length > 500) {
      console.log("...(truncated)");
    }
  }

  if (checkOnly) {
    console.log("\nRun 'nightshift update' to install this update.");
    return;
  }

  // Confirm installation unless --force
  if (!force) {
    console.log("\nInstall this update? [y/N] ");

    // Read user input
    const response = await new Promise<string>((resolve) => {
      process.stdin.setEncoding("utf8");
      process.stdin.once("data", (data) => {
        resolve(data.toString().trim().toLowerCase());
      });

      // Timeout after 30 seconds
      setTimeout(() => resolve(""), 30000);
    });

    if (response !== "y" && response !== "yes") {
      console.log("Update cancelled.");
      return;
    }
  }

  // Download update
  console.log("\nDownloading update...");
  const downloadResult = await downloadUpdate(updateInfo, (progress) => {
    process.stdout.write(`\rDownloading: ${progress.percentComplete}%`);
  });

  if (!downloadResult.success || !downloadResult.filePath) {
    console.error(`\nDownload failed: ${downloadResult.error}`);
    process.exit(1);
  }

  console.log("\nDownload complete.");

  // Install update
  console.log("Installing update...");
  const installResult = await installUpdate(downloadResult.filePath);

  if (!installResult.success) {
    console.error(`Installation failed: ${installResult.error}`);
    process.exit(1);
  }

  console.log("Update installed successfully.");

  if (installResult.requiresRestart) {
    console.log("Restarting...");
    await scheduleRestart();
  }
}
