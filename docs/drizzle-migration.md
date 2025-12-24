# Migration Plan: Raw SQL to Drizzle ORM

## Overview

Migrate the Night Shift daemon from raw SQL (better-sqlite3) to Drizzle ORM with Bun SQLite for type-safe database operations.

## Current State

- **Database**: better-sqlite3 with raw SQL strings
- **Schema**: SQL CREATE TABLE statements in `src/db/schema.ts`
- **Migrations**: Custom migration system in `src/db/migrations.ts`
- **Repository Pattern**: Manual SQL queries with `db.prepare()` and `stmt.run()`

### Files Using Database (11 files)

| File | Usage |
|------|-------|
| `src/db/sqlite.ts` | Connection, init, health checks |
| `src/db/schema.ts` | Raw SQL CREATE TABLE statements |
| `src/db/migrations.ts` | Custom migration runner |
| `src/tasks/repository.ts` | Task CRUD operations |
| `src/tasks/repos.ts` | Repo CRUD operations |
| `src/executor/session-manager.ts` | Session CRUD |
| `src/server/routes/api/tasks.ts` | Task queries |
| `src/server/routes/api/repos.ts` | Repo queries |
| `src/server/routes/api/sessions.ts` | Session queries |
| `src/server/routes/api/status.ts` | Status queries |
| `src/cli/commands/repos.ts` | Repo CLI commands |
| `src/update/installer.ts` | Config queries |

---

## Migration Strategy

### Approach: Incremental Migration

1. **Add Drizzle alongside existing code** (no breaking changes)
2. **Convert schema first** (Drizzle schema files)
3. **Migrate repositories one by one**
4. **Remove old code after verification**

### Why Drizzle?

- **Type-safe queries** - No more `any` types on rows
- **Declarative schema** - TypeScript instead of SQL strings
- **Built-in migrations** - `drizzle-kit` handles schema changes
- **Bun-native** - First-class `bun:sqlite` support
- **Relational queries** - Joins without raw SQL

---

## Implementation Plan

### Phase 1: Setup Drizzle (Day 1)

#### 1.1 Install Dependencies

```bash
cd packages/daemon
bun add drizzle-orm
bun add -D drizzle-kit
```

#### 1.2 Create Drizzle Schema

**File:** `src/db/drizzle/schema.ts`

```typescript
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

// Tasks table
export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  prompt: text('prompt').notNull(),
  repoId: text('repoId'),
  repoPath: text('repoPath'),
  priority: text('priority', { enum: ['low', 'medium', 'high', 'urgent'] }).default('medium'),
  status: text('status', {
    enum: ['pending', 'claimed', 'running', 'paused', 'completed', 'failed', 'needs_human', 'canceled']
  }).notNull(),
  // ... all other columns
}, (table) => [
  index('idx_tasks_status').on(table.status),
  index('idx_tasks_repoId').on(table.repoId),
  // ... other indexes
]);

// Repos table
export const repos = sqliteTable('repos', { ... });

// Sessions table
export const sessions = sqliteTable('sessions', { ... });

// Config table
export const config = sqliteTable('config', { ... });

// Sync queue table
export const syncQueue = sqliteTable('sync_queue', { ... });
```

#### 1.3 Create Drizzle Config

**File:** `drizzle.config.ts`

```typescript
import { defineConfig } from 'drizzle-kit';
import { DB_PATH } from './src/config/paths';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/drizzle/schema.ts',
  out: './src/db/drizzle/migrations',
  dbCredentials: {
    url: DB_PATH,
  },
});
```

#### 1.4 Create Drizzle Client

**File:** `src/db/drizzle/client.ts`

Using `bun:sqlite` native driver (faster, no native dependencies):

```typescript
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import * as schema from './schema';

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let sqlite: Database | null = null;

export function initDrizzle(path: string) {
  sqlite = new Database(path);
  sqlite.exec('PRAGMA journal_mode = WAL');
  sqlite.exec('PRAGMA synchronous = NORMAL');
  sqlite.exec('PRAGMA foreign_keys = ON');

  db = drizzle(sqlite, { schema });
  return db;
}

export function getDb() {
  if (!db) throw new Error('Database not initialized');
  return db;
}

export function closeDb() {
  sqlite?.close();
  db = null;
  sqlite = null;
}

// Type helper for the database instance
export type DrizzleDb = NonNullable<typeof db>;
```

**Note:** Using `bun:sqlite` instead of `better-sqlite3`:
- Native Bun driver (no native compilation needed)
- Faster performance
- Simpler binary distribution

---

### Phase 2: Migrate Repositories (Day 1-2)

#### 2.1 Tasks Repository

**File:** `src/tasks/repository.ts`

Replace raw SQL with Drizzle queries:

```typescript
// Before (raw SQL)
export function getTaskById(taskId: string): Task | null {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM tasks WHERE id = ?');
  const row = stmt.get(taskId) as any;
  return row ? mapRowToTask(row) : null;
}

// After (Drizzle)
import { eq } from 'drizzle-orm';
import { getDb } from '../db/drizzle/client';
import { tasks } from '../db/drizzle/schema';

export function getTaskById(taskId: string): Task | null {
  const db = getDb();
  const result = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
  return result ?? null;  // Already typed!
}
```

**Operations to convert:**
- `createTask()` → `db.insert(tasks).values(...)`
- `getTaskById()` → `db.select().from(tasks).where(eq(tasks.id, id)).get()`
- `getTasks()` → `db.select().from(tasks).where(...).limit().offset()`
- `updateTask()` → `db.update(tasks).set(...).where(eq(tasks.id, id))`
- `deleteTask()` → `db.delete(tasks).where(eq(tasks.id, id))`
- `getTaskCountByStatus()` → `db.select({ status, count }).from(tasks).groupBy(tasks.status)`

#### 2.2 Repos Repository

**File:** `src/tasks/repos.ts`

Same pattern - convert all CRUD operations.

#### 2.3 Session Manager

**File:** `src/executor/session-manager.ts`

Convert session CRUD operations.

---

### Phase 3: Migrate API Routes (Day 2)

Convert direct database calls in route handlers to use Drizzle.

| Route File | Changes |
|------------|---------|
| `routes/api/tasks.ts` | Use Drizzle for task queries |
| `routes/api/repos.ts` | Use Drizzle for repo queries |
| `routes/api/sessions.ts` | Use Drizzle for session queries |
| `routes/api/status.ts` | Use Drizzle for status queries |

---

### Phase 4: Migration System (Day 2)

Using **drizzle-kit** for schema migrations (user selected).

#### Development Workflow

```bash
# After changing schema.ts, generate migration SQL
bun drizzle-kit generate

# Apply migrations to database
bun drizzle-kit migrate

# Or push directly during development (no migration files)
bun drizzle-kit push
```

#### Programmatic Migration on Daemon Startup

**File:** `src/db/drizzle/client.ts` (updated)

```typescript
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { Database } from 'bun:sqlite';
import * as schema from './schema';

export async function initDb(path: string) {
  const sqlite = new Database(path);
  sqlite.exec('PRAGMA journal_mode = WAL');
  sqlite.exec('PRAGMA synchronous = NORMAL');
  sqlite.exec('PRAGMA foreign_keys = ON');

  const db = drizzle(sqlite, { schema });

  // Run migrations on startup
  await migrate(db, { migrationsFolder: './src/db/drizzle/migrations' });

  return { db, sqlite };
}
```

#### Initial Migration from Existing Database

Since we have an existing database with data:

1. Create Drizzle schema matching existing tables exactly
2. Use `drizzle-kit push` for initial sync (no migration needed)
3. Future changes use `drizzle-kit generate` + `migrate`

---

### Phase 5: Cleanup (Day 3)

1. Remove old `src/db/schema.ts` (raw SQL)
2. Remove old `src/db/migrations.ts` (custom system)
3. Update `src/db/index.ts` exports
4. Update `src/db/sqlite.ts` to use Drizzle
5. Remove `mapRowToTask()`, `mapRowToRepo()` functions (Drizzle handles typing)

---

## File Changes Summary

### New Files
```
src/db/drizzle/
├── schema.ts          # Drizzle schema definitions
├── client.ts          # Drizzle client singleton
└── migrations/        # Generated migration files
drizzle.config.ts      # Drizzle-kit configuration
```

### Modified Files
```
src/db/index.ts              # Update exports
src/db/sqlite.ts             # Use Drizzle client
src/tasks/repository.ts      # Convert to Drizzle queries
src/tasks/repos.ts           # Convert to Drizzle queries
src/executor/session-manager.ts  # Convert to Drizzle queries
src/server/routes/api/tasks.ts   # Use new repository
src/server/routes/api/repos.ts   # Use new repository
src/server/routes/api/sessions.ts # Use new repository
src/server/routes/api/status.ts  # Use new queries
src/cli/commands/repos.ts    # Use new repository
src/update/installer.ts      # Use new config queries
package.json                 # Add drizzle dependencies
```

### Deleted Files
```
src/db/schema.ts      # Replaced by drizzle/schema.ts
src/db/migrations.ts  # Replaced by drizzle-kit
```

---

## Key Benefits After Migration

| Aspect | Before | After |
|--------|--------|-------|
| **Type Safety** | `any` on all rows | Full TypeScript types |
| **Query Building** | Manual string concatenation | Type-safe query builder |
| **Migrations** | Custom system | drizzle-kit generate/migrate |
| **Schema** | SQL strings | TypeScript objects |
| **Relations** | Manual JOINs | Drizzle relational queries |
| **Debugging** | Raw SQL errors | Typed errors with context |

---

## Rollback Plan

1. All changes are additive until Phase 5
2. Old code remains functional during migration
3. Can revert by removing Drizzle imports and restoring old calls
4. Database file format is unchanged (SQLite)

---

## Existing Database Compatibility

Drizzle works with existing SQLite databases:
- Schema must match existing table structure
- No data migration needed (same tables)
- Use `drizzle-kit pull` to generate schema from existing DB if needed

---

## Testing Strategy

1. Run existing functionality after each phase
2. Verify CRUD operations work correctly
3. Check task lifecycle: create → claim → run → complete
4. Verify pause/resume flow
5. Test CLI commands (`nightshift add`, `nightshift repos`)

---

## Scripts to Add

```json
// package.json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  }
}
```

---

## Estimated Effort

| Phase | Effort |
|-------|--------|
| Phase 1: Setup | 2-3 hours |
| Phase 2: Repositories | 3-4 hours |
| Phase 3: API Routes | 2-3 hours |
| Phase 4: Migrations | 1-2 hours |
| Phase 5: Cleanup | 1 hour |
| **Total** | **1-2 days** |
