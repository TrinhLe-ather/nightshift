/**
 * Version Checker
 *
 * Checks for updates from GitHub releases.
 */

import { VERSION } from "@nightshift/shared";
import type { UpdateInfo } from "@nightshift/shared";
import { join } from "path";
import { NIGHTSHIFT_DIR } from "../config/paths";
import { existsSync, readFileSync, writeFileSync } from "fs";

/**
 * GitHub repository for releases (matches install.sh)
 * Can be overridden via NIGHTSHIFT_REPO env var
 */
const NIGHTSHIFT_REPO = process.env.NIGHTSHIFT_REPO || "sipherxyz/nightshift";
const GITHUB_API = process.env.GITHUB_API || "https://api.github.com";
const RELEASES_URL = `${GITHUB_API}/repos/${NIGHTSHIFT_REPO}/releases/latest`;

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
  assets: GitHubAsset[];
}

/**
 * Check for updates from GitHub releases
 */
export async function checkForUpdates(): Promise<UpdateInfo | null> {
  const now = new Date().toISOString();

  try {
    const response = await fetch(RELEASES_URL, {
      headers: {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": `NightShift/${VERSION}`,
        // Support GITHUB_TOKEN to avoid rate limits (matches install.sh)
        ...(process.env.GITHUB_TOKEN
          ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
          : {}),
      },
    });

    if (!response.ok) {
      // No releases yet or API error
      saveUpdateState({
        ...getUpdateState(),
        lastCheckAt: now,
      });
      return null;
    }

    const release = (await response.json()) as GitHubRelease;
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
              checksum = match[1];
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
    };

    // Check if this is actually newer
    const isNewer = compareVersions(latestVersion, VERSION) > 0;

    saveUpdateState({
      lastCheckAt: now,
      availableVersion: isNewer ? latestVersion : null,
      downloadUrl: isNewer && binaryAsset ? binaryAsset.browser_download_url : null,
      checksum: isNewer ? checksum : null,
      releaseNotes: isNewer ? release.body : null,
      publishedAt: isNewer ? release.published_at : null,
      dismissed: false,
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
 * Fetch release info for a specific version (matches install.sh tag support)
 * @param target - Version string (e.g., "0.1.0", "v0.1.0", "latest", "stable")
 */
export async function fetchRelease(target: string = "latest"): Promise<UpdateInfo | null> {
  // Resolve release URL based on target (matches install.sh logic)
  let releaseUrl: string;
  if (target === "latest" || target === "stable" || !target) {
    releaseUrl = RELEASES_URL;
  } else {
    // Ensure tag has 'v' prefix
    const tag = target.startsWith("v") ? target : `v${target}`;
    releaseUrl = `${GITHUB_API}/repos/${NIGHTSHIFT_REPO}/releases/tags/${tag}`;
  }

  try {
    const response = await fetch(releaseUrl, {
      headers: {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": `NightShift/${VERSION}`,
        ...(process.env.GITHUB_TOKEN
          ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
          : {}),
      },
    });

    if (!response.ok) {
      return null;
    }

    const release = (await response.json()) as GitHubRelease;
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
              checksum = match[1];
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
