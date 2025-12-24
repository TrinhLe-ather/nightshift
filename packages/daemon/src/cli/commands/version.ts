/**
 * Version Command
 *
 * Displays the current Night Shift version.
 */

import { VERSION } from "@nightshift/shared";

/**
 * Display version
 */
export function versionCommand(): void {
  console.log(VERSION);
}
