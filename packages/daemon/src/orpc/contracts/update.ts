/**
 * oRPC Contracts for Update Endpoints
 *
 * Provides type-safe RPC handlers for update checking, downloading, and installation.
 */

import { z } from "zod";
import {
  checkForUpdates,
  downloadUpdate,
  getCachedUpdateInfo,
  getCurrentVersion,
  getDownloadedUpdatePath,
  getLastCheckTime,
  hasActiveTask,
  installUpdate,
  isUpdateAvailable,
  scheduleRestart,
} from "../../update";
import { orpc } from "../base";

// =============================================================================
// Zod Schemas
// =============================================================================

const updateStatusSchema = z.object({
  currentVersion: z.string(),
  updateAvailable: z.boolean(),
  availableVersion: z.string().nullable(),
  downloadUrl: z.string().nullable(),
  releaseNotes: z.string().nullable(),
  publishedAt: z.string().nullable(),
  lastCheckAt: z.string().nullable(),
  canUpdate: z.boolean(),
});

const checkUpdateResponseSchema = z.object({
  currentVersion: z.string(),
  updateAvailable: z.boolean(),
  availableVersion: z.string().nullable(),
  downloadUrl: z.string().nullable(),
  releaseNotes: z.string().nullable(),
  publishedAt: z.string().nullable(),
  lastCheckAt: z.string().nullable(),
});

const downloadResponseSchema = z.object({
  downloaded: z.boolean(),
  filePath: z.string(),
  version: z.string(),
});

const installResponseSchema = z.object({
  installed: z.boolean(),
  version: z.string(),
  restarting: z.boolean(),
});

// =============================================================================
// Handlers
// =============================================================================

/**
 * Get current version and update availability
 */
const getStatus = orpc.output(updateStatusSchema).handler(async () => {
  const updateInfo = getCachedUpdateInfo();
  const lastCheckTime = getLastCheckTime();

  return {
    currentVersion: getCurrentVersion(),
    updateAvailable: isUpdateAvailable(),
    availableVersion: updateInfo?.version || null,
    downloadUrl: updateInfo?.downloadUrl || null,
    releaseNotes: updateInfo?.releaseNotes || null,
    publishedAt: updateInfo?.publishedAt || null,
    lastCheckAt: lastCheckTime,
    canUpdate: !(await hasActiveTask()),
  };
});

/**
 * Check GitHub releases for updates
 */
const check = orpc.output(checkUpdateResponseSchema).handler(async ({ errors }) => {
  try {
    const updateInfo = await checkForUpdates();

    return {
      currentVersion: getCurrentVersion(),
      updateAvailable: !!updateInfo,
      availableVersion: updateInfo?.version || null,
      downloadUrl: updateInfo?.downloadUrl || null,
      releaseNotes: updateInfo?.releaseNotes || null,
      publishedAt: updateInfo?.publishedAt || null,
      lastCheckAt: getLastCheckTime(),
    };
  } catch (error) {
    // Avoid leaking raw upstream/network errors to the client.
    console.error("[update.check] Failed to check for updates:", error);
    throw errors.INTERNAL_SERVER_ERROR({ message: "Failed to check for updates" });
  }
});

/**
 * Download update binary
 */
const download = orpc.output(downloadResponseSchema).handler(async ({ errors }) => {
  const updateInfo = getCachedUpdateInfo();

  if (!updateInfo) {
    throw errors.NOT_FOUND({ message: "No update available", data: { resource: "update" } });
  }

  try {
    const result = await downloadUpdate(updateInfo);

    if (!result.success || !result.filePath) {
      console.error("[update.download] Download failed:", result.error);
      throw errors.INTERNAL_SERVER_ERROR({ message: "Download failed" });
    }

    return {
      downloaded: true,
      filePath: result.filePath,
      version: updateInfo.version,
    };
  } catch (error) {
    console.error("[update.download] Download failed:", error);
    throw errors.INTERNAL_SERVER_ERROR({ message: "Download failed" });
  }
});

/**
 * Install update and schedule restart
 */
const install = orpc.output(installResponseSchema).handler(async ({ errors }) => {
  // Check for active tasks
  if (await hasActiveTask()) {
    throw errors.CONFLICT({ message: "Cannot update while a task is running" });
  }

  const updateInfo = getCachedUpdateInfo();

  if (!updateInfo) {
    throw errors.NOT_FOUND({ message: "No update available", data: { resource: "update" } });
  }

  // Check if already downloaded
  let downloadPath = getDownloadedUpdatePath(updateInfo.version);

  if (!downloadPath) {
    // Download first
    const downloadResult = await downloadUpdate(updateInfo);

    if (!downloadResult.success || !downloadResult.filePath) {
      console.error("[update.install] Failed to download update:", downloadResult.error);
      throw errors.INTERNAL_SERVER_ERROR({ message: "Failed to download update" });
    }

    downloadPath = downloadResult.filePath;
  }

  // Install
  const installResult = await installUpdate(downloadPath);

  if (!installResult.success) {
    console.error("[update.install] Installation failed:", installResult.error);
    throw errors.INTERNAL_SERVER_ERROR({ message: "Installation failed" });
  }

  // Schedule restart
  // Note: This will cause the server to restart, so the response may not complete
  setTimeout(async () => {
    await scheduleRestart();
  }, 500);

  return {
    installed: true,
    version: updateInfo.version,
    restarting: true,
  };
});

// =============================================================================
// Router Export
// =============================================================================

export const updateRouter = {
  getStatus,
  check,
  download,
  install,
};
