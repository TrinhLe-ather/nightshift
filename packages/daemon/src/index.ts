#!/usr/bin/env bun
/**
 * Night Shift Daemon
 * Entry point for the CLI daemon application
 */

import { cli } from "./cli";

// Run CLI
cli().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
