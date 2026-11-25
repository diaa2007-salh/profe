# Architecture

## Stack

Next.js 16 App Router, React, TypeScript, PostgreSQL/Neon, Kysely, Auth.js v5
(Credentials with JWT sessions), Zod, Tailwind v4, and ExcelJS for monthly
workbooks.

## Request and authorization flow

The authenticated application routes are protected by `proxy.ts` and the
server layout. Database reads happen in Server Components or server-only
services. Every Server Action and data endpoint independently reads the
current account role and re-checks its access scope.

`src/lib/server/access.ts` resolves `ADMIN` versus `TEACHER`, the teacher
profile, and assigned halaqas. Administrators can access all groups; teachers
can access only students assigned to their halaqas. Client-side controls do
not replace these checks.

## Main areas

- `(app)/page.tsx`: attendance-only dashboard with today's counts and the
  five highest monthly absence totals.
- `(app)/students/`: active and archived student roster scoped by role.
- `(app)/attendance/`: daily teacher and student attendance.
- `(app)/monthly/`: RTL attendance matrix and Excel export.
- `/api/monthly-attendance`: one authorized, batched monthly data response.
- `(app)/settings/`: profile settings for teachers; global settings, groups,
  teacher accounts, and backup controls for administrators.
- `lib/business/monthly-attendance.ts`: pure day aggregation shared by the
  UI data service and tests.
- `lib/server/monthly-attendance.ts`: role-scoped batch queries.
- `lib/db/types.ts`: Kysely database types; SQL schema is snake_case and
  `CamelCasePlugin` maps it to these TypeScript names.

## Dates and attendance

The institution timezone is `Africa/Algiers` for server-derived dates and
late arrival times. Browser date inputs use local date components rather
than UTC conversion. The database attendance key includes the session
template because one student may attend more than one session per day.

When multiple session records map to one monthly date cell, the cell
collapses them using `ABSENT` before `LATE` before `PRESENT`; totals count
distinct recorded student-days and never treat an unrecorded day as absence.
