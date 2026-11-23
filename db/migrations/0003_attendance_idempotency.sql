BEGIN;

-- Keep late_minutes optional; old rows and non-late rows may use NULL.
ALTER TABLE student_attendance
  ALTER COLUMN late_minutes DROP NOT NULL;

-- Re-apply the late-row invariant without requiring late_minutes.
ALTER TABLE student_attendance
  DROP CONSTRAINT IF EXISTS late_requires_arrival;

ALTER TABLE student_attendance
  ADD CONSTRAINT late_requires_arrival CHECK (
    (status = 'LATE' AND arrival_time IS NOT NULL)
    OR (status <> 'LATE' AND arrival_time IS NULL AND late_minutes IS NULL)
  );

-- Preserve the existing session dimension: one record per student, date,
-- and session template. 0001's constraint already provides this; this block
-- makes the migration safe for databases initialized outside 0001.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'student_attendance'
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) LIKE 'UNIQUE (student_id, session_date, session_template_id)'
  ) THEN
    ALTER TABLE student_attendance
      ADD CONSTRAINT student_attendance_unique_student_date_session
      UNIQUE (student_id, session_date, session_template_id);
  END IF;
END $$;

COMMIT;
