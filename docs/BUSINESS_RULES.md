# BUSINESS_RULES.md

The authoritative list. If code and this document disagree, that's a bug
in one of them — check the integration tests, which are the actual source
of truth (each rule below names where it's tested).

## The daily session state machine

`src/lib/business/session-state.ts` — `computeDailySessionState()`, a pure
function, one of six states:

`NOT_SCHOOL_DAY` / `HOLIDAY` / `CANCELLED` / `SCHEDULED` /
`TEACHER_ABSENT` / `TEACHER_PRESENT` — checked in that priority order. A
holiday and a cancellation are never collapsed into one concept even
though both block attendance, because callers need to tell them apart
(RULE 3 below).

Fetched fresh from the database by `src/lib/server/session-state.server.ts`
— the *only* place that does this fetch. Both the dashboard
(`lib/server/today.ts`) and every attendance Server Action import this one
function rather than each re-implementing the fetch-and-compute logic,
specifically so they can't drift out of sync with each other.

Tested: `lib/business/__tests__/session-state.test.ts` (pure logic, the
spec's own TEST 1-4) and
`app/(app)/attendance/__tests__/actions.integration.test.ts` (the same
rules through the real Server Action against real Postgres).

## RULE 1 / 7 — student attendance requires the teacher to be PRESENT

`canRecordStudentAttendance()` returns true only for `TEACHER_PRESENT`.
Enforced in `recordStudentAttendance()` by re-fetching state from the
database on every call — never by trusting that the UI only showed the
form when it was legal. Verified by calling the Server Action directly
after marking the teacher absent and confirming rejection.

## RULE 2 — cancelled session blocks both teacher and student attendance

Same re-fetch, same Server Action. A cancellation with
`session_template_id = NULL` applies to every session that day.

## RULE 3 — holiday is not the same thing as a cancelled session

Both block attendance; they are still distinct `DailySessionState` values,
not merged, so a caller can tell the difference.

## RULE 4 — holiday is not counted as an absence

A holiday never reaches the point where a `student_attendance` row could
even be created — RULE 1's gate blocks it before that.

## RULE 5 / RULE 13 — cancelled/holiday/teacher-absent sessions don't count
toward the attendance-rate denominator

`countsTowardAttendanceDenominator()` returns true *only* for
`TEACHER_PRESENT`. `sessionsHeld` (in both `monthly.ts` and
`statistics.ts`) is computed via `getValidSessionsInRange()`
(`lib/server/session-state.server.ts`), which re-checks every
`teacher_attendance` PRESENT row against the *current* holiday and
cancellation configuration — not just "a row exists". Found during a
hardening review: without this re-check, adding a holiday or cancellation
*after* attendance was already recorded for a date inside it would leave
the old row silently still counting, since the naive query
(`COUNT(*) FROM teacher_attendance WHERE status='PRESENT'`) has no way to
know the calendar changed after the fact. Historical rows are never
deleted for this — they're excluded from live aggregation only, never
scrubbed from the database.

## RULE 6 / RULE 11 — teacher absence is never converted into student absence

When a teacher is switched to `ABSENT` after students were already marked
for that session, `recordTeacherAttendance()` deletes those now-invalid
`student_attendance` rows rather than leaving them or reinterpreting them
as `ABSENT`. Verified: mark present, mark late, then mark the teacher
absent, then confirm zero `student_attendance` rows remain for that
session.

## RULE 8 / 19 — idempotency: one row per (student, date, session)

Database-level `UNIQUE` constraint, not just application logic. The
Server Action uses `ON CONFLICT ... DO UPDATE` (an edit is a real SQL
`UPDATE`, never a second `INSERT` — spec rule 9). A raw `INSERT` bypassing
the upsert is rejected by the constraint itself, confirmed in the
integration tests.

## RULE 9 — late requires a valid arrival time, computed server-side

`calculateLateMinutes(sessionStart, sessionEnd, arrivalTime)` in
`lib/business/attendance.ts`. Arrival must be strictly after the session
start and no later than the session end — arriving "late" before the
session started is treated as a data-entry error, not a negative number.
The Server Action always recomputes this from the real session template's
times fetched from the database; a client-supplied minute count is never
trusted (there isn't one — the form only ever sends a clock time).

## Verse validation and overlap (spec sections 24-25)

`lib/business/verse-validation.ts`:
- Ordering (`from <= to`, respecting surah order) is checked
  unconditionally.
- The upper bound (verse <= surah's real verse count) is checked *only*
  when `verse_count` is populated for that surah — currently never, since
  no verified Warsh dataset has been imported (see
  `docs/QURAN_DATA_SOURCE.md`). The result carries a `fullyVerified` flag
  so callers can distinguish "checked and valid" from "ordering was fine
  but the upper bound is simply unknown yet" — the UI shows a
  corresponding note rather than presenting an unverified range as
  confirmed.
- Overlap with an existing record for the same student is a warning,
  never a block, and never deletes the earlier record (spec 25, verified
  in the memorization integration tests).

## RTL bidi isolation

Not a data rule, but it breaks silently rather than throwing, which makes
it easy to reintroduce. `components/Ltr.tsx` wraps any digit-group string
(phone numbers, "18:00 - 20:00"-style time ranges) that would otherwise
have its groups reordered by the browser inside RTL paragraph text.
Currently applied: guardian phone numbers (Students), session time ranges
(Home, Attendance, Settings). Apply it to any new one.

## No ranking (spec sections 27/31)

`getClassMonthlySummary()`'s `perStudent` array is explicitly ordered
alphabetically (`ORDER BY full_name`), never by attendance rate or any
other performance metric, and the shape contains no rank/position field.
Enforced by a test that asserts the array is *already* alphabetically
sorted and that the JSON contains none of the words rank/best/worst/top —
see `lib/server/__tests__/statistics.integration.test.ts`.

## Login rate limiting

`lib/auth/rate-limit.ts` — 5 failed attempts per email locks out further
attempts for 15 minutes, checked in the Credentials provider's
`authorize()` before the database is even queried. **Limitation, not
hidden**: this is in-process memory, not a shared store — correct for the
current single-process deployment model, but a horizontally-scaled
deployment (multiple serverless instances) would need Redis or a DB-backed
attempt log for this to hold across instances. See `docs/DEPLOYMENT.md`.

## Archived students remain reachable for history, not just "not deleted"

Archiving a student correctly removes them from the *active* roster used
for new attendance/memorization entries (`WHERE is_active = true` on
those pages), but Monthly Follow-up's student picker deliberately includes
archived students too (labeled "(مؤرشف)") — found during a hardening
review that the original implementation made their historical data
technically preserved in the database but practically unreachable through
the UI, which doesn't satisfy "history remains viewable" (spec section 7)
even though no data was actually lost.
