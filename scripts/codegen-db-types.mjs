#!/usr/bin/env node
// Regenerates src/lib/db/types.ts from the live database, then corrects the
// columns that are Postgres DATE (not TIMESTAMPTZ) to `string`. This matches
// the runtime: src/lib/db/client.ts registers a pg type parser (oid 1082)
// that returns DATE columns as plain "YYYY-MM-DD" strings instead of the
// default JS Date object, specifically to avoid timezone-shift bugs on
// values that are pure calendar dates. kysely-codegen doesn't know about
// that override, so this script re-applies the correction after every run.
//
// Usage: node scripts/codegen-db-types.mjs
// Re-run this after any migration that adds/changes a DATE column.

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const DATE_COLUMNS = new Set([
  "startDate",
  "endDate",
  "birthDate",
  "sessionDate",
  "weekStart",
]);

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

execSync(
  `npx kysely-codegen --url "${url}" --out-file src/lib/db/types.ts --camel-case`,
  { stdio: "inherit" }
);

const path = "src/lib/db/types.ts";
const lines = readFileSync(path, "utf8").split("\n");

const fixed = lines.map((line) => {
  const match = /^\s*(\w+):\s*(Timestamp)(\s*\|\s*null)?;/.exec(line);
  if (match && DATE_COLUMNS.has(match[1])) {
    return line.replace("Timestamp", "string");
  }
  return line;
});

writeFileSync(path, fixed.join("\n"));
console.log(`Patched ${[...DATE_COLUMNS].join(", ")} columns to string in ${path}`);
