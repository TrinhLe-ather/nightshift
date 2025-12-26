/**
 * Version / Build metadata
 *
 * Important:
 * - VERSION must remain semver-only because it is used in comparisons.
 * - Build metadata (commit/date) is provided separately for display/logging.
 */

// These are injected at build time via Bun.build({ define: { ... } }).
// When running from source (dev), they may be absent.
declare const __NIGHTSHIFT_VERSION__: string;
declare const __NIGHTSHIFT_COMMIT__: string;
declare const __NIGHTSHIFT_BUILD_DATE__: string;

const FALLBACK_VERSION = "0.0.1";

export const VERSION: string =
  typeof __NIGHTSHIFT_VERSION__ !== "undefined" && __NIGHTSHIFT_VERSION__
    ? __NIGHTSHIFT_VERSION__
    : FALLBACK_VERSION;

export const BUILD_COMMIT: string =
  typeof __NIGHTSHIFT_COMMIT__ !== "undefined" && __NIGHTSHIFT_COMMIT__
    ? __NIGHTSHIFT_COMMIT__
    : "";

export const BUILD_DATE: string =
  typeof __NIGHTSHIFT_BUILD_DATE__ !== "undefined" && __NIGHTSHIFT_BUILD_DATE__
    ? __NIGHTSHIFT_BUILD_DATE__
    : "";

export function getVersionDisplay(): string {
  if (BUILD_COMMIT) return `${VERSION} (${BUILD_COMMIT})`;
  return VERSION;
}
