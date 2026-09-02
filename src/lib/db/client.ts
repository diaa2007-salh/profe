import { Pool, types } from "pg";
import { Kysely, PostgresDialect, CamelCasePlugin } from "kysely";
import type { DB } from "./types";

// Postgres DATE (oid 1082) defaults to a JS Date object via node-postgres,
// which invites timezone-shift bugs for values that are pure calendar dates
// with no time component (academic year, holidays, session_date, etc).
// Return them as plain "YYYY-MM-DD" strings instead.
types.setTypeParser(1082, (val) => val);

declare global {
  var __hifzDb: Kysely<DB> | undefined;
}

function createDb() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
  });
  // The actual SQL schema is snake_case; types.ts was generated with
  // --camel-case for TS ergonomics. CamelCasePlugin is what makes
  // .selectFrom("sessionCancellation") actually resolve to the real
  // session_cancellation table/columns at query time — without it, Kysely
  // sends the camelCase identifier to Postgres literally and every query
  // on a multi-word table/column fails with "relation does not exist".
  return new Kysely<DB>({
    dialect: new PostgresDialect({ pool }),
    plugins: [new CamelCasePlugin()],
  });
}

// Reuse the pool across hot reloads in dev instead of exhausting connections.
export const db = globalThis.__hifzDb ?? createDb();
if (process.env.NODE_ENV !== "production") {
  globalThis.__hifzDb = db;
}
