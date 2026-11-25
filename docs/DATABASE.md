# Database

PostgreSQL 16 (including Neon). SQL migrations in `db/migrations/` are
applied manually with `psql`; there is no automated migration runner.

## Migration order

- Fresh database: apply `0001_init.sql`, then `0002_optional_late_minutes.sql`,
  `0003_attendance_idempotency.sql`, and `0004_roles_halaqas.sql`.
- Existing database created from `0001`: apply `0002`, `0003`, and `0004` in
  that order.
- `0005_drop_study_tracking_DATA_LOSS.sql` is a separate, irreversible
  deletion of historical study-tracking tables. Verify an external backup
  and obtain explicit owner approval before running it on production.

Example:

```bash
psql "$DATABASE_URL" -f db/migrations/0004_roles_halaqas.sql
```

## Important constraints

- `student_attendance` is unique by `(student_id, session_date,
  session_template_id)`: different sessions on a day remain distinct.
- `teacher_attendance` is unique by teacher profile, date, and session.
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
