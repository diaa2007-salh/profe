# DATABASE.md

PostgreSQL 16. Schema in `db/migrations/0001_init.sql`, applied directly
with `psql` (see the Prisma deviation in PRODUCTION_MIGRATION.md for why).

## Applying migrations

```bash
psql "$DATABASE_URL" -f db/migrations/0001_init.sql
```

New migrations should be added as `db/migrations/000N_description.sql` and
applied the same way, in order. There is no automated migration runner —
for a single-teacher app with one deployment, this was judged simpler and
more transparent than adding a migration-tracking table and runner for its
own sake. Revisit this if the app ever needs to support multiple
independent deployments (see "future multi-tenant" note below).

## Regenerating TypeScript types

```bash
pnpm run db:types
```

Runs `kysely-codegen` against `$DATABASE_URL`, then re-patches the columns
that are SQL `DATE` (not `TIMESTAMPTZ`) back to `string` — see
`scripts/codegen-db-types.mjs` and the note in `docs/ARCHITECTURE.md`. Run
this after any migration that adds, removes, or retypes a column.

## Real constraints doing real work

These were each verified by attempting to violate them and confirming
Postgres rejects the attempt (see the integration test suites, not just
this description):

- **`session_cancellation` — `EXCLUDE USING gist`**: two cancellation
  periods for the same session (or both "all sessions",
  `session_template_id IS NULL`) cannot overlap. Requires the
  `btree_gist` extension.
- **`student_attendance` — `CHECK (late_requires_arrival)`**: `LATE`
  requires `arrival_time`; `late_minutes` is optional so existing calculated
  values remain intact while new records can omit them. Every other status
  requires both to be `NULL`. Enforced at the database, not just in the
  Server Action. Migration `0002_optional_late_minutes.sql` updates this
  constraint without changing existing attendance data.
- **`student_attendance` — `UNIQUE (student_id, session_date,
  session_template_id)`**: attendance is keyed per student, date, and
  session because a day may contain multiple sessions. Single-student
  updates use `ON CONFLICT ... DO UPDATE`; bulk preparation uses
  `ON CONFLICT ... DO NOTHING` to preserve an existing ABSENT/LATE record.
  This unique constraint already exists in the initial schema.
- **`academic_year` — partial unique index `WHERE is_active`**: at most one
  academic year active at a time.
- **`monthly_evaluation` — `UNIQUE (student_id, year, month)`**: one
  evaluation row per student per month, upserted.

## What's deliberately NOT stored

Per spec section 28 ("don't store derived numbers if they can be
computed"), `monthly_evaluation` holds only the teacher's own judgment —
`grade` and `notes`. Every number shown on the Monthly Follow-up and
Statistics pages (sessions held, present/late/absent counts, attendance
rate, total late minutes) is computed live from `teacher_attendance` /
`student_attendance` / `weekly_memorization` — see
`src/lib/server/monthly.ts` and `statistics.ts`. There is nothing to keep
in sync or invalidate.

## Quran reference data

`quran_surah` is seeded with all 114 canonical surah numbers and Arabic
names (riwayah-independent, safe to hard-code). `verse_count` is `NULL`
for every row and must stay that way until a verified Warsh-specific
source is imported — see `docs/QURAN_DATA_SOURCE.md`. `mushaf_page` and
`mushaf_thumn` exist as schema only, with zero rows, for the same reason.

## Future multi-tenant note

The schema is single-teacher by design (no `teacher_id` foreign keys
anywhere), matching the spec's explicit scope. If this ever needs to
support multiple teachers/sections, the migration path is: add a
`teacher_id`/`section_id` column to `student`, `academic_year`,
`session_template`, and cascade from there — every other table already
reaches those through existing foreign keys, so the blast radius is
smaller than it might look.
