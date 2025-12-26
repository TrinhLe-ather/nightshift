/**
 * Version Command
 *
 * Displays the current Night Shift version.
 */

import { getVersionDisplay } from "@nightshift/shared";

/**
 * Display version
 */
export function versionCommand(): void {
  console.log(getVersionDisplay());
}
