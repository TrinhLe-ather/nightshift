/**
 * Default Configuration Values
 *
 * Default settings for the Night Shift daemon.
 * These are used when creating a new config file.
 */

import type { Config } from "@nightshift/shared";

/**
 * Default daemon configuration
 */
export const DEFAULT_CONFIG: Config = {
  /** Default port for local web UI */
  port: 3847,

  /** LAN access disabled by default for security */
  allowLan: false,

  /** Task timeout: 4 hours in milliseconds */
  taskTimeoutMs: 4 * 60 * 60 * 1000,

  /** Local queue enabled by default (standalone mode) */
  localQueueEnabled: true,

  /** Remote queue disabled by default (requires connection) */
  remoteQueueEnabled: false,

  /** Server URL undefined until connected */
  serverUrl: undefined,

  /** Schedule undefined (run 24/7 by default) */
  scheduleStart: undefined,
  scheduleEnd: undefined,

  /** Maximum 1 concurrent task per repo */
  maxConcurrentTasks: 10,

  /** Terminal shell: auto-detect system default */
  terminalShell: "auto",

  /** Update channel: stable (production) or latest (includes prereleases) */
  updateChannel: "stable",
};
