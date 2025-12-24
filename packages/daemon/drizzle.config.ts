/**
 * Drizzle Kit Configuration
 *
 * Used for schema migrations and database tooling.
 */

import { defineConfig } from "drizzle-kit";
import { homedir } from "os";
import { join } from "path";

// Match the path from src/config/paths.ts
const NIGHTSHIFT_DIR = join(homedir(), ".nightshift");
const DB_PATH = join(NIGHTSHIFT_DIR, "nightshift.db");

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/drizzle/schema/schema.ts",
  out: "./src/db/drizzle/migrations",
  dbCredentials: {
    url: DB_PATH,
  },
  // Verbose logging for development
  verbose: true,
  // Use strict mode for better type safety
  strict: true,
});
