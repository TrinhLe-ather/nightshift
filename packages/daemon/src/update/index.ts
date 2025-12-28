/**
 * Update Module - Barrel Export
 *
 * Auto-update functionality for Night Shift daemon.
 */

// Version checking
export {
  checkForUpdates,
  fetchRelease,
  getCachedUpdateInfo,
  isUpdateAvailable,
  isUpdateDismissed,
  dismissUpdate,
  getLastCheckTime,
  getCurrentVersion,
  compareVersions,
  getPlatformId,
  getBinaryName,
} from "./version-checker";

// Download
export {
  downloadUpdate,
  getDownloadedUpdatePath,
  cleanupDownloads,
  type DownloadProgress,
  type DownloadProgressCallback,
  type DownloadResult,
} from "./downloader";

// Installation
export {
  installUpdate,
  hasActiveTask,
  getCurrentBinaryPath,
  getInstallPath,
  isCompiledBinary,
  cleanupBackup,
  rollbackUpdate,
  scheduleRestart,
  type InstallResult,
} from "./installer";
