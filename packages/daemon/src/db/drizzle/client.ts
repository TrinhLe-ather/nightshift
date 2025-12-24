/**
 * Drizzle Database Client
 *
 * Manages the Drizzle ORM connection with bun:sqlite.
 * Provides singleton instance for database access.
 */

import { BunSQLiteDatabase, drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { Database } from "bun:sqlite";
import { existsSync, readdirSync } from "fs";
import { dirname, join } from "path";
import { DB_PATH, ensureNightShiftDirectories } from "../../config/paths";
import { type DrizzleSchema, schema } from "./schema";

// Type for our database instance with schema
export type DrizzleDb = BunSQLiteDatabase<DrizzleSchema>;

// Singleton instances
let db: DrizzleDb | null = null;
let sqlite: Database | null = null;

/**
 * Database initialization options
 */
export interface InitDbOptions {
  /**
   * Database file path override (for testing)
   */
  path?: string;

  /**
   * Enable verbose logging (default: false)
   */
  verbose?: boolean;
}

/**
 * Initialize the Drizzle database connection
 *
 * This function:
 * 1. Ensures ~/.nightshift directory exists
 * 2. Opens/creates the database file with bun:sqlite
 * 3. Enables WAL mode and foreign keys
 * 4. Creates the Drizzle ORM instance
 *
 * @param options - Initialization options
 * @returns Drizzle database instance
 */
export function initDb(options: InitDbOptions = {}): DrizzleDb {
  const { path = DB_PATH, verbose = false } = options;

  // Ensure directory structure exists
  ensureNightShiftDirectories();

  // Open database with bun:sqlite
  sqlite = new Database(path);

  // Enable WAL mode for crash recovery and better concurrency
  sqlite.run("PRAGMA journal_mode = WAL");

  // Recommended SQLite settings
  sqlite.run("PRAGMA synchronous = NORMAL");
  sqlite.run("PRAGMA foreign_keys = ON");

  // Create Drizzle instance with schema for relational queries
  db = drizzle(sqlite, {
    schema,
    logger: verbose,
  });

  console.log(`Database initialized at ${path}`);

  return db;
}

/**
 * Get the database instance
 *
 * If not initialized, will initialize with default options.
 *
 * @returns Drizzle database instance
 */
export function getDb(): DrizzleDb {
  if (!db) {
    db = initDb();
  }
  return db;
}

/**
 * Get the raw bun:sqlite Database instance
 *
 * Useful for direct SQL operations or PRAGMA queries.
 *
 * @returns Raw SQLite database instance
 */
export function getSqlite(): Database {
  if (!sqlite) {
    initDb();
  }
  return sqlite!;
}

/**
 * Close the database connection
 *
 * Should be called on daemon shutdown.
 */
export function closeDb(): void {
  if (sqlite) {
    sqlite.close();
    sqlite = null;
    db = null;
  }
}

/**
 * Check if database is initialized
 */
export function isDbInitialized(): boolean {
  return db !== null;
}

/**
 * Database stats
 */
export interface DbStats {
  path: string;
  walEnabled: boolean;
  pageSize: number;
  pageCount: number;
  tables: string[];
}

/**
 * Get database statistics
 */
export function getDbStats(): DbStats {
  const database = getSqlite();

  const journalMode = database.query("PRAGMA journal_mode").get() as {
    journal_mode: string;
  };
  const pageSize = database.query("PRAGMA page_size").get() as {
    page_size: number;
  };
  const pageCount = database.query("PRAGMA page_count").get() as {
    page_count: number;
  };

  // Get all table names
  const tables = database
    .query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_%' ORDER BY name")
    .all() as Array<{ name: string }>;

  return {
    path: DB_PATH,
    walEnabled: journalMode.journal_mode === "wal",
    pageSize: pageSize.page_size,
    pageCount: pageCount.page_count,
    tables: tables.map((t) => t.name),
  };
}

/**
 * Run a health check on the database
 *
 * Useful for `nightshift doctor` command
 */
export function checkDbHealth(): {
  healthy: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  try {
    const database = getSqlite();

    // Check WAL mode
    const journalMode = database.query("PRAGMA journal_mode").get() as {
      journal_mode: string;
    };
    if (journalMode.journal_mode !== "wal") {
      issues.push("WAL mode is not enabled");
    }

    // Check foreign keys
    const foreignKeys = database.query("PRAGMA foreign_keys").get() as {
      foreign_keys: number;
    };
    if (foreignKeys.foreign_keys !== 1) {
      issues.push("Foreign keys are not enabled");
    }

    // Check that all expected tables exist
    const stats = getDbStats();
    const expectedTables = ["tasks", "repos", "sessions", "config", "sync_queue"];
    const missingTables = expectedTables.filter((table) => !stats.tables.includes(table));

    if (missingTables.length > 0) {
      issues.push(`Missing tables: ${missingTables.join(", ")}`);
    }

    // Run integrity check
    const integrityCheck = database.query("PRAGMA integrity_check").get() as {
      integrity_check: string;
    };
    if (integrityCheck.integrity_check !== "ok") {
      issues.push(`Database integrity check failed: ${integrityCheck.integrity_check}`);
    }

    return {
      healthy: issues.length === 0,
      issues,
    };
  } catch (error) {
    issues.push(`Database health check failed: ${error}`);
    return {
      healthy: false,
      issues,
    };
  }
}

/**
 * Get the migrations folder path
 *
 * Resolves the path relative to the source/compiled location.
 */
function getMigrationsFolder(): string {
  // When running from source: ./src/db/drizzle/migrations
  // When compiled: relative to the binary location
  const possiblePaths = [
    // Development: relative to this file
    join(dirname(import.meta.path), "migrations"),
    // Development: relative to project root
    join(process.cwd(), "src/db/drizzle/migrations"),
    // Compiled: alongside the binary
    join(dirname(process.execPath), "migrations"),
  ];

  for (const p of possiblePaths) {
    if (existsSync(p)) {
      return p;
    }
  }

  // Default to the development path (will be created if needed)
  return join(dirname(import.meta.path), "migrations");
}

/**
 * Migration result
 */
export interface MigrationResult {
  /**
   * Whether migrations were run successfully
   */
  success: boolean;

  /**
   * Number of migrations applied
   */
  migrationsApplied: number;

  /**
   * Error message if failed
   */
  error?: string;

  /**
   * Whether migrations folder exists
   */
  hasMigrations: boolean;
}

/**
 * Run database migrations
 *
 * This should be called after initDb() during daemon startup.
 * It applies any pending migrations from the migrations folder.
 *
 * @returns Migration result with status and count
 */
export async function runMigrations(): Promise<MigrationResult> {
  if (!db) {
    return {
      success: false,
      migrationsApplied: 0,
      error: "Database not initialized. Call initDb() first.",
      hasMigrations: false,
    };
  }

  const migrationsFolder = getMigrationsFolder();

  // Check if migrations folder exists
  if (!existsSync(migrationsFolder)) {
    console.log("No migrations folder found. Run 'bun db:generate' to create migrations.");
    return {
      success: true,
      migrationsApplied: 0,
      hasMigrations: false,
    };
  }

  // Check if there are any migration files
  const files = readdirSync(migrationsFolder);
  const sqlFiles = files.filter((f) => f.endsWith(".sql"));

  if (sqlFiles.length === 0) {
    console.log("No migration files found in migrations folder.");
    return {
      success: true,
      migrationsApplied: 0,
      hasMigrations: false,
    };
  }

  try {
    console.log(`Running migrations from ${migrationsFolder}...`);

    // Run drizzle migrations
    // Note: We use the existing db instance. The type assertion is needed because
    // drizzle's migrate function has overly strict typing for schema-enabled instances.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    migrate<DrizzleSchema>(db as any, { migrationsFolder });

    console.log(`Migrations complete. ${sqlFiles.length} migration file(s) processed.`);

    return {
      success: true,
      migrationsApplied: sqlFiles.length,
      hasMigrations: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Migration failed: ${errorMessage}`);

    return {
      success: false,
      migrationsApplied: 0,
      error: errorMessage,
      hasMigrations: true,
    };
  }
}
