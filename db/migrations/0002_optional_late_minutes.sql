BEGIN;

ALTER TABLE student_attendance
  DROP CONSTRAINT late_requires_arrival;

ALTER TABLE student_attendance
  ADD CONSTRAINT late_requires_arrival CHECK (
    (status = 'LATE' AND arrival_time IS NOT NULL)
    OR (status <> 'LATE' AND arrival_time IS NULL AND late_minutes IS NULL)
  );

COMMIT;
