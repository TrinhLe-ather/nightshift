/**
 * Binary Downloader
 *
 * Downloads and verifies update binaries.
 */

import { join } from "path";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { NIGHTSHIFT_DIR } from "../config/paths";
import type { UpdateInfo } from "@nightshift/shared";

/**
 * Downloads directory for update binaries
 */
const DOWNLOADS_DIR = join(NIGHTSHIFT_DIR, "downloads");

/**
 * Download progress callback
 */
export type DownloadProgressCallback = (progress: DownloadProgress) => void;

/**
 * Download progress info
 */
export interface DownloadProgress {
  bytesDownloaded: number;
  totalBytes: number;
  percentComplete: number;
}

/**
 * Download result
 */
export interface DownloadResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

/**
 * Ensure downloads directory exists
 */
function ensureDownloadsDir(): void {
  if (!existsSync(DOWNLOADS_DIR)) {
    mkdirSync(DOWNLOADS_DIR, { recursive: true });
  }
}

/**
 * Compute SHA256 hash of file contents
 */
async function computeSha256(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data.buffer as ArrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Download update binary with progress tracking
 */
export async function downloadUpdate(
  updateInfo: UpdateInfo,
  onProgress?: DownloadProgressCallback,
): Promise<DownloadResult> {
  ensureDownloadsDir();

  const fileName = `nightshift-${updateInfo.version}${process.platform === "win32" ? ".exe" : ""}`;
  const filePath = join(DOWNLOADS_DIR, fileName);

  try {
    const response = await fetch(updateInfo.downloadUrl, {
      headers: {
        "User-Agent": "NightShift-Updater",
      },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Download failed: HTTP ${response.status}`,
      };
    }

    const contentLength = parseInt(response.headers.get("content-length") || "0", 10);
    const reader = response.body?.getReader();

    if (!reader) {
      return {
        success: false,
        error: "Unable to read response body",
      };
    }

    const chunks: Uint8Array[] = [];
    let bytesDownloaded = 0;

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      chunks.push(value);
      bytesDownloaded += value.length;

      if (onProgress && contentLength > 0) {
        onProgress({
          bytesDownloaded,
          totalBytes: contentLength,
          percentComplete: Math.round((bytesDownloaded / contentLength) * 100),
        });
      }
    }

    // Combine chunks into single buffer
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const data = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.length;
    }

    // Verify checksum if provided
    if (updateInfo.checksum) {
      const actualChecksum = await computeSha256(data);

      if (actualChecksum.toLowerCase() !== updateInfo.checksum.toLowerCase()) {
        return {
          success: false,
          error: `Checksum verification failed. Expected: ${updateInfo.checksum}, Got: ${actualChecksum}`,
        };
      }
    }

    // Write to disk
    writeFileSync(filePath, data);

    return {
      success: true,
      filePath,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Download failed",
    };
  }
}

/**
 * Get path to downloaded update if it exists
 */
export function getDownloadedUpdatePath(version: string): string | null {
  const fileName = `nightshift-${version}${process.platform === "win32" ? ".exe" : ""}`;
  const filePath = join(DOWNLOADS_DIR, fileName);

  if (existsSync(filePath)) {
    return filePath;
  }

  return null;
}

/**
 * Clean up old downloads
 */
export function cleanupDownloads(): void {
  // TODO: Implement cleanup of old download files
}
