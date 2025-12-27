/**
 * Drizzle Database Client
 *
 * Manages the Drizzle ORM connection with bun:sqlite.
 * Provides singleton instance for database access.
 */

import { BunSQLiteDatabase, drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import { DB_PATH, ensureNightShiftDirectories } from "../../config/paths";
import { type DrizzleSchema, schema } from "./schema";
import { migrations } from "./migrate";

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
  /**
   * Schema version derived from the Drizzle migrations table (`__drizzle_migrations`).
   * This is the number of applied migrations, or 0 if the table does not exist yet.
   */
  schemaVersion: number;
  /**
   * Latest applied migration hash, if available.
   */
  latestMigrationHash: string | null;
  /**
   * Raw `created_at` from the latest migration row, if available.
   * Drizzle stores this as an integer in SQLite.
   */
  latestMigrationCreatedAt: number | string | null;
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
    .query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND substr(name, 1, 1) != '_' ORDER BY name",
    )
    .all() as Array<{ name: string }>;

  // Read Drizzle migration metadata (table may not exist on first run)
  let schemaVersion = 0;
  let latestMigrationHash: string | null = null;
  let latestMigrationCreatedAt: number | string | null = null;
  try {
    const migrationsTableExists = database
      .query(
        "SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations' LIMIT 1",
      )
      .get() as { ok: 1 } | null;

    if (migrationsTableExists) {
      const countRow = database
        .query("SELECT COUNT(*) AS count FROM __drizzle_migrations")
        .get() as { count: number } | null;
      schemaVersion = countRow?.count ?? 0;

      const latestRow = database
        .query("SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1")
        .get() as { hash: string; created_at: number | string } | null;

      latestMigrationHash = latestRow?.hash ?? null;
      latestMigrationCreatedAt = latestRow?.created_at ?? null;
    }
  } catch {
    // If anything goes wrong, leave migration metadata as null/0.
  }

  return {
    path: DB_PATH,
    walEnabled: journalMode.journal_mode === "wal",
    pageSize: pageSize.page_size,
    pageCount: pageCount.page_count,
    tables: tables.map((t) => t.name),
    schemaVersion,
    latestMigrationHash,
    latestMigrationCreatedAt,
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
 * Run embedded migrations when file-based migrations are not available
 *
 * This is used when running from a compiled binary where the migrations
 * folder is not bundled with the executable.
 */
function runEmbeddedMigrations(): MigrationResult {
  if (!sqlite || !db) {
    return {
      success: false,
      migrationsApplied: 0,
      error: "Database not initialized.",
      hasMigrations: false,
    };
  }

  console.log("Running embedded migrations...");

  try {
    // Create Drizzle migrations table if it doesn't exist
    sqlite.run(`
      CREATE TABLE IF NOT EXISTS __drizzle_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);

    // Get already applied migrations
    const appliedMigrations = sqlite.query("SELECT hash FROM __drizzle_migrations").all() as Array<{
      hash: string;
    }>;
    const appliedHashes = new Set(appliedMigrations.map((m) => m.hash));

    let migrationsApplied = 0;

    for (const migration of migrations) {
      // Drizzle uses the tag as the hash
      if (appliedHashes.has(migration.tag)) {
        continue;
      }

      console.log(`Applying migration: ${migration.tag}`);

      // Split by Drizzle's statement breakpoint marker and execute each statement
      const statements = migration.sql
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      for (const statement of statements) {
        sqlite.run(statement);
      }

      // Record the migration
      sqlite.run("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)", [
        migration.tag,
        new Date().getTime(),
      ]);

      migrationsApplied++;
    }

    console.log(`Embedded migrations complete. ${migrationsApplied} migration(s) applied.`);

    return {
      success: true,
      migrationsApplied,
      hasMigrations: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Embedded migration failed: ${errorMessage}`);

    return {
      success: false,
      migrationsApplied: 0,
      error: errorMessage,
      hasMigrations: true,
    };
  }
}

/**
 * Run database migrations
 *
 * This should be called after initDb() during daemon startup.
 * It applies any pending migrations from the migrations folder.
 * If file-based migrations are not available (e.g., running from compiled binary),
 * it falls back to embedded migrations.
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

  return runEmbeddedMigrations();
}
