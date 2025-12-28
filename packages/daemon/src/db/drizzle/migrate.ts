/**
 * Embedded Migrations
 *
 * This file contains migration SQL embedded directly in the code.
 * This ensures migrations work when running from a compiled binary
 * where the file-based migrations folder isn't available.
 *
 * IMPORTANT: This file must be regenerated when migrations change.
 * Run: bun run daemon db:embed-migrations
 */

import _0000 from "./migrations/0000_perpetual_zodiak.sql" with { type: "text" };
import _0001 from "./migrations/0001_grey_agent_zero.sql" with { type: "text" };
import _0002 from "./migrations/0002_dear_patriot.sql" with { type: "text" };

export type Migration = {
  tag: string;
  sql: string;
};

export const migrations: Migration[] = [
  {
    tag: "0000_perpetual_zodiak",
    sql: _0000,
  },
  {
    tag: "0001_grey_agent_zero",
    sql: _0001,
  },
  {
    tag: "0002_dear_patriot",
    sql: _0002,
  },
];
