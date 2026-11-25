# Business rules

## Attendance eligibility

`lib/business/session-state.ts` computes whether a session is a school day,
holiday, cancelled, scheduled, or has teacher attendance. Student attendance
is allowed only after the current teacher profile is marked present.
Server Actions recompute this state from the database on every write.

Marking the teacher absent removes only that teacher's group's student rows
for the affected session, inside the same transaction. It does not convert
those rows into student absences.

## Idempotency and monthly summaries

Student records are upserted using the unique student/date/session key.
Bulk preparation inserts only students without an existing row and preserves
any recorded absence or late status.

Monthly cells represent recorded student-days. Days without a stored row
remain `-` and do not enter any status total. When more than one session row
exists for the same student and date, the displayed day status uses the
priority `ABSENT`, then `LATE`, then `PRESENT`.

## Late arrival

The server stores the arrival time using `Africa/Algiers`; changing a student
to another status clears that time. The UI displays only `HH:mm`. The legacy
nullable `late_minutes` column remains for old database records and is not
required for new entries.

## Roles and groups

The first account created by setup is an administrator. Administrators can
create teacher accounts, create halaqas, and link teachers to groups.
Teachers can see and update only students in their assigned groups.
Authorization is checked in every server action, page data query, and API
route that returns student information.

## Login rate limiting

`lib/auth/rate-limit.ts` limits repeated failed credential attempts in
process memory. A horizontally scaled deployment should replace this with a
shared store if cross-instance rate-limit enforcement is required.
