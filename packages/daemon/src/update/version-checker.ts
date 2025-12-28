/**
 * Version Checker
 *
 * Checks for updates from GitHub releases.
 * Supports two update channels:
 * - stable: Only production releases (default)
 * - latest: Includes prereleases (beta, rc, canary)
 */

import { VERSION } from "@nightshift/shared";
import type { UpdateInfo, UpdateChannel } from "@nightshift/shared";
import { join } from "path";
import { NIGHTSHIFT_DIR } from "../config/paths";
import { existsSync, readFileSync, writeFileSync } from "fs";

/**
 * GitHub repository for releases (matches install.sh)
 * Can be overridden via NIGHTSHIFT_REPO env var
 */
const NIGHTSHIFT_REPO = process.env.NIGHTSHIFT_REPO || "sipherxyz/nightshift";
const GITHUB_API = process.env.GITHUB_API || "https://api.github.com";

/** Stable channel: only non-prerelease versions */
const RELEASES_STABLE_URL = `${GITHUB_API}/repos/${NIGHTSHIFT_REPO}/releases/latest`;
/** Latest channel: includes prereleases (fetches all, takes first) */
const RELEASES_ALL_URL = `${GITHUB_API}/repos/${NIGHTSHIFT_REPO}/releases?per_page=1`;

/**
 * Path to update state file
 */
const UPDATE_STATE_PATH = join(NIGHTSHIFT_DIR, "update-state.json");

/**
 * Platform-specific binary names
 */
const PLATFORM_BINARIES: Record<string, string> = {
  "darwin-arm64": "nightshift-darwin-arm64",
  "darwin-x64": "nightshift-darwin-x64",
  "linux-x64": "nightshift-linux-x64",
  "win32-x64": "nightshift-win-x64.exe",
};

/**
 * Get current platform identifier
 */
export function getPlatformId(): string {
  const platform = process.platform;
  const arch = process.arch;
  return `${platform}-${arch}`;
}

/**
 * Get binary name for current platform
 */
export function getBinaryName(): string {
  const platformId = getPlatformId();
  return PLATFORM_BINARIES[platformId] || `nightshift-${platformId}`;
}

/**
 * Update state persisted to disk
 */
interface UpdateState {
  lastCheckAt: string | null;
  availableVersion: string | null;
  downloadUrl: string | null;
  checksum: string | null;
  releaseNotes: string | null;
  publishedAt: string | null;
  dismissed: boolean;
  /** Channel the update was fetched from */
  channel: UpdateChannel | null;
  /** Whether the available update is a prerelease */
  isPrerelease: boolean | null;
}

/**
 * Get configured update channel from config
 * Falls back to "stable" if not configured
 */
async function getUpdateChannel(): Promise<UpdateChannel> {
  try {
    const { getConfig } = await import("../config");
    const config = getConfig();
    return config.updateChannel || "stable";
  } catch {
    return "stable";
  }
}

/**
 * Get current update state from disk
 */
export function getUpdateState(): UpdateState {
  const defaultState: UpdateState = {
    lastCheckAt: null,
    availableVersion: null,
    downloadUrl: null,
    checksum: null,
    releaseNotes: null,
    publishedAt: null,
    dismissed: false,
    channel: null,
    isPrerelease: null,
  };

  if (!existsSync(UPDATE_STATE_PATH)) {
    return defaultState;
  }

  try {
    const content = readFileSync(UPDATE_STATE_PATH, "utf-8");
    return { ...defaultState, ...JSON.parse(content) };
  } catch {
    return defaultState;
  }
}

/**
 * Save update state to disk
 */
function saveUpdateState(state: UpdateState): void {
  try {
    writeFileSync(UPDATE_STATE_PATH, JSON.stringify(state, null, 2), "utf-8");
  } catch {
    // Silently fail - non-critical
  }
}

/**
 * Compare semantic versions
 * Returns 1 if a > b, -1 if a < b, 0 if equal
 */
export function compareVersions(a: string, b: string): number {
  const parseVersion = (v: string): number[] => {
    return v
      .replace(/^v/, "")
      .split(".")
      .map((n) => parseInt(n, 10) || 0);
  };

  const vA = parseVersion(a);
  const vB = parseVersion(b);

  for (let i = 0; i < Math.max(vA.length, vB.length); i++) {
    const numA = vA[i] || 0;
    const numB = vB[i] || 0;
    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }

  return 0;
}

/**
 * Check if update is available
 */
export function isUpdateAvailable(): boolean {
  const state = getUpdateState();
  if (!state.availableVersion) return false;
  return compareVersions(state.availableVersion, VERSION) > 0;
}

/**
 * GitHub release asset info
 */
interface GitHubAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

/**
 * GitHub release response
 */
interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  prerelease: boolean;
  assets: GitHubAsset[];
}

/**
 * Common headers for GitHub API requests
 */
function getGitHubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": `NightShift/${VERSION}`,
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

/**
 * Fetch release based on channel
 * - stable: Uses /releases/latest (excludes prereleases)
 * - latest: Uses /releases?per_page=1 (includes prereleases)
 */
async function fetchReleaseByChannel(channel: UpdateChannel): Promise<GitHubRelease | null> {
  const url = channel === "stable" ? RELEASES_STABLE_URL : RELEASES_ALL_URL;

  try {
    const response = await fetch(url, { headers: getGitHubHeaders() });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    // For "latest" channel, response is an array
    if (channel === "latest") {
      const releases = data as GitHubRelease[];
      return releases[0] || null;
    }

    // For "stable" channel, response is a single release object
    return data as GitHubRelease;
  } catch {
    return null;
  }
}

/**
 * Check for updates from GitHub releases
 * Uses the configured update channel (stable or latest)
 */
export async function checkForUpdates(): Promise<UpdateInfo | null> {
  const now = new Date().toISOString();
  const channel = await getUpdateChannel();

  try {
    const release = await fetchReleaseByChannel(channel);

    if (!release) {
      // No releases yet or API error
      saveUpdateState({
        ...getUpdateState(),
        lastCheckAt: now,
      });
      return null;
    }

    const latestVersion = release.tag_name.replace(/^v/, "");

    // Find binary for this platform (matches install.sh naming)
    const binaryName = getBinaryName();
    const binaryAsset = release.assets.find((a) => a.name === binaryName);
    // Use combined SHA256SUMS file (matches install.sh)
    const checksumAsset = release.assets.find((a) => a.name === "SHA256SUMS");

    // Get checksum from SHA256SUMS file (matches install.sh parsing)
    let checksum: string | null = null;
    if (checksumAsset) {
      try {
        const checksumResponse = await fetch(checksumAsset.browser_download_url);
        if (checksumResponse.ok) {
          const checksumText = await checksumResponse.text();
          // Format: "sha256hash  filename" - match install.sh grep pattern
          const lines = checksumText.split("\n");
          for (const line of lines) {
            // Match: hash followed by two spaces and filename
            const match = line.match(/^([a-f0-9]{64})\s+(.+)$/);
            if (match && match[2] === binaryName) {
              checksum = match[1] ?? null;
              break;
            }
          }
        }
      } catch {
        // Checksum fetch failed - continue without
      }
    }

    const updateInfo: UpdateInfo = {
      version: latestVersion,
      downloadUrl: binaryAsset?.browser_download_url || "",
      checksum: checksum || "",
      releaseNotes: release.body || undefined,
      publishedAt: release.published_at,
      isPrerelease: release.prerelease,
    };

    // Check if this is actually newer
    const isNewer = compareVersions(latestVersion, VERSION) > 0;

    saveUpdateState({
      lastCheckAt: now,
      availableVersion: isNewer ? latestVersion : null,
      downloadUrl: isNewer && binaryAsset ? binaryAsset.browser_download_url : null,
      checksum: isNewer ? checksum : null,
      releaseNotes: isNewer ? release.body || null : null,
      publishedAt: isNewer ? release.published_at : null,
      dismissed: false,
      channel: isNewer ? channel : null,
      isPrerelease: isNewer ? release.prerelease : null,
    });

    return isNewer ? updateInfo : null;
  } catch {
    // Network error - save check time but keep existing state
    saveUpdateState({
      ...getUpdateState(),
      lastCheckAt: now,
    });
    return null;
  }
}

/**
 * Fetch release info for a specific version or channel
 * @param target - Version string (e.g., "0.1.0", "v0.1.0") or channel ("latest", "stable")
 *
 * Channel behavior:
 * - "stable": Fetches /releases/latest (excludes prereleases)
 * - "latest": Fetches /releases (includes prereleases, returns first)
 * - Specific version: Fetches /releases/tags/v{version}
 */
export async function fetchRelease(target: string = "latest"): Promise<UpdateInfo | null> {
  let release: GitHubRelease | null = null;

  try {
    // Handle channel shortcuts
    if (target === "latest") {
      release = await fetchReleaseByChannel("latest");
    } else if (target === "stable" || !target) {
      release = await fetchReleaseByChannel("stable");
    } else {
      // Fetch specific version by tag
      const tag = target.startsWith("v") ? target : `v${target}`;
      const releaseUrl = `${GITHUB_API}/repos/${NIGHTSHIFT_REPO}/releases/tags/${tag}`;

      const response = await fetch(releaseUrl, { headers: getGitHubHeaders() });
      if (!response.ok) {
        return null;
      }
      release = (await response.json()) as GitHubRelease;
    }

    if (!release) {
      return null;
    }

    const version = release.tag_name.replace(/^v/, "");

    // Find binary for this platform
    const binaryName = getBinaryName();
    const binaryAsset = release.assets.find((a) => a.name === binaryName);
    const checksumAsset = release.assets.find((a) => a.name === "SHA256SUMS");

    if (!binaryAsset) {
      return null;
    }

    // Get checksum from SHA256SUMS file
    let checksum: string | null = null;
    if (checksumAsset) {
      try {
        const checksumResponse = await fetch(checksumAsset.browser_download_url);
        if (checksumResponse.ok) {
          const checksumText = await checksumResponse.text();
          const lines = checksumText.split("\n");
          for (const line of lines) {
            const match = line.match(/^([a-f0-9]{64})\s+(.+)$/);
            if (match && match[2] === binaryName) {
              checksum = match[1] ?? null;
              break;
            }
          }
        }
      } catch {
        // Continue without checksum
      }
    }

    return {
      version,
      downloadUrl: binaryAsset.browser_download_url,
      checksum: checksum || "",
      releaseNotes: release.body || undefined,
      publishedAt: release.published_at,
      isPrerelease: release.prerelease,
    };
  } catch {
    return null;
  }
}

/**
 * Get cached update info without checking network
 */
export function getCachedUpdateInfo(): UpdateInfo | null {
  const state = getUpdateState();

  if (!state.availableVersion || !state.downloadUrl) {
    return null;
  }

  if (compareVersions(state.availableVersion, VERSION) <= 0) {
    return null;
  }

  return {
    version: state.availableVersion,
    downloadUrl: state.downloadUrl,
    checksum: state.checksum || "",
    releaseNotes: state.releaseNotes || undefined,
    publishedAt: state.publishedAt || new Date().toISOString(),
  };
}

/**
 * Dismiss update notification (until next version)
 */
export function dismissUpdate(): void {
  saveUpdateState({
    ...getUpdateState(),
    dismissed: true,
  });
}

/**
 * Check if update was dismissed
 */
export function isUpdateDismissed(): boolean {
  return getUpdateState().dismissed;
}

/**
 * Get last check timestamp
 */
export function getLastCheckTime(): string | null {
  return getUpdateState().lastCheckAt;
}

/**
 * Get current version
 */
export function getCurrentVersion(): string {
  return VERSION;
}
