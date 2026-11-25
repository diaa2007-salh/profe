# Database

PostgreSQL 16 (including Neon). SQL migrations in `db/migrations/` are
applied manually with `psql`; there is no automated migration runner.

## Migration order

- Fresh database: apply `0001_init.sql`, then `0002_optional_late_minutes.sql`,
  `0003_attendance_idempotency.sql`, `0004_roles_halaqas.sql`, and
  `0006_two_daily_periods.sql`.
- Existing database created from `0001`: apply `0002`, `0003`, `0004`, and
  `0006_two_daily_periods.sql` in that order.
- `0005_drop_study_tracking_DATA_LOSS.sql` is a separate, irreversible
  deletion of historical study-tracking tables. Verify an external backup
  and obtain explicit owner approval before running it on production.
- `0006_two_daily_periods.sql` is non-destructive; existing attendance rows
  become period 1 and new rows may use period 1 or 2.

Example:

```bash
psql "$DATABASE_URL" -f db/migrations/0006_two_daily_periods.sql
```

With the project's `pg` dependency and a local `.env`, the same migration can
be applied using Node:

```bash
node --env-file=.env -e 'const fs = require("node:fs"); const { Pool } = require("pg"); (async () => { const pool = new Pool({ connectionString: process.env.DATABASE_URL }); try { await pool.query(fs.readFileSync("db/migrations/0006_two_daily_periods.sql", "utf8")); console.log("Migration 0006 applied"); } finally { await pool.end(); } })().catch((error) => { console.error(error); process.exitCode = 1; });'
```

## Important constraints

- `student_attendance` is unique by `(student_id, session_date,
  session_template_id, period)`; period is constrained to 1 or 2.
- `teacher_attendance` is unique by teacher profile, date, session template,
  and period.
- Bulk preparation inserts only absent attendance rows and preserves
  existing `ABSENT` and `LATE` records in one transaction.
- `late_minutes` remains nullable for historical compatibility. New writes
  leave it null; arrival time is the only late detail used by the interface.
- `student.halaqa_id` and `teacher_halaqa` enforce data scoping in server
  queries. Admin accounts may access all halaqas; teachers may access only
  their assignments.
- The cancellation exclusion constraint prevents overlapping ranges for the
  same session (or all sessions); the active-year index permits one active
  academic year.

## Type generation

```bash
pnpm run db:types
```

`scripts/codegen-db-types.mjs` regenerates Kysely types and reapplies the
SQL `DATE`-as-string adjustments. The current generated types deliberately
omit tables removed from application code; regenerate after applying the
final destructive migration.
