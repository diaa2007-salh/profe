BEGIN;

ALTER TABLE student_attendance
  ALTER COLUMN late_minutes DROP NOT NULL;

ALTER TABLE student_attendance
  DROP CONSTRAINT IF EXISTS late_requires_arrival;

ALTER TABLE student_attendance
  ADD CONSTRAINT late_requires_arrival CHECK (
    (status = 'LATE' AND arrival_time IS NOT NULL)
    OR (status <> 'LATE' AND arrival_time IS NULL AND late_minutes IS NULL)
  );

ALTER TABLE student_attendance
  ADD COLUMN IF NOT EXISTS period smallint NOT NULL DEFAULT 1;

ALTER TABLE teacher_attendance
  ADD COLUMN IF NOT EXISTS period smallint NOT NULL DEFAULT 1;

ALTER TABLE student_attendance
  DROP CONSTRAINT IF EXISTS student_attendance_period_valid;
ALTER TABLE student_attendance
  ADD CONSTRAINT student_attendance_period_valid CHECK (period IN (1, 2));

ALTER TABLE teacher_attendance
  DROP CONSTRAINT IF EXISTS teacher_attendance_period_valid;
ALTER TABLE teacher_attendance
  ADD CONSTRAINT teacher_attendance_period_valid CHECK (period IN (1, 2));

DO $$
DECLARE
  constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'student_attendance'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) = 'UNIQUE (student_id, session_date, session_template_id)'
  LOOP
    EXECUTE format('ALTER TABLE student_attendance DROP CONSTRAINT %I', constraint_row.conname);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'student_attendance'::regclass
      AND conname = 'student_attendance_unique_student_date_session_period'
  ) THEN
    ALTER TABLE student_attendance
      ADD CONSTRAINT student_attendance_unique_student_date_session_period
      UNIQUE (student_id, session_date, session_template_id, period);
  END IF;

  FOR constraint_row IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'teacher_attendance'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) IN (
        'UNIQUE (session_date, session_template_id)',
        'UNIQUE (teacher_profile_id, session_date, session_template_id)'
      )
  LOOP
    EXECUTE format('ALTER TABLE teacher_attendance DROP CONSTRAINT %I', constraint_row.conname);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'teacher_attendance'::regclass
      AND conname = 'teacher_attendance_unique_teacher_session_period'
  ) THEN
    ALTER TABLE teacher_attendance
      ADD CONSTRAINT teacher_attendance_unique_teacher_session_period
      UNIQUE (teacher_profile_id, session_date, session_template_id, period);
  END IF;
END $$;

COMMIT;
