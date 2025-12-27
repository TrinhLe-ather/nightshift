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

export type Migration = {
  tag: string;
  sql: string;
};

console.log(_0000);

export const migrations: Migration[] = [
  {
    tag: "0000_perpetual_zodiak",
    sql: _0000,
  },
];
