BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE app_role AS ENUM ('ADMIN', 'TEACHER');
  END IF;
END $$;

ALTER TABLE app_user
  ADD COLUMN role app_role NOT NULL DEFAULT 'ADMIN';

-- Only pre-existing accounts inherit admin access; future accounts use
-- least privilege unless setup/admin explicitly assigns a role.
ALTER TABLE app_user
  ALTER COLUMN role SET DEFAULT 'TEACHER';

CREATE TABLE IF NOT EXISTS halaqa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teacher_halaqa (
  teacher_profile_id uuid NOT NULL REFERENCES teacher_profile(id) ON DELETE CASCADE,
  halaqa_id uuid NOT NULL REFERENCES halaqa(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (teacher_profile_id, halaqa_id)
);

ALTER TABLE student
  ADD COLUMN IF NOT EXISTS halaqa_id uuid REFERENCES halaqa(id);

-- This schema was previously single-teacher and had no historical class
-- assignment. Keep all existing students in the original teacher's group.
INSERT INTO halaqa (id, name)
SELECT profile.id, COALESCE(NULLIF(BTRIM(profile.halaqa_name), ''), profile.full_name || ' - الحلقة')
FROM teacher_profile AS profile
WHERE NOT EXISTS (
  SELECT 1 FROM halaqa AS h WHERE h.id = profile.id
);

INSERT INTO halaqa (name)
SELECT 'الحلقة الافتراضية'
WHERE NOT EXISTS (SELECT 1 FROM halaqa);

INSERT INTO teacher_halaqa (teacher_profile_id, halaqa_id)
SELECT profile.id, COALESCE(
  own_halaqa.id,
  (
    SELECT h.id
    FROM halaqa AS h
    ORDER BY h.created_at, h.id
    LIMIT 1
  )
)
FROM teacher_profile AS profile
LEFT JOIN halaqa AS own_halaqa ON own_halaqa.id = profile.id
ON CONFLICT DO NOTHING;

UPDATE student AS s
SET halaqa_id = (
  SELECT h.id
  FROM halaqa AS h
  ORDER BY h.created_at, h.id
  LIMIT 1
)
WHERE s.halaqa_id IS NULL;

ALTER TABLE student
  ALTER COLUMN halaqa_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_student_halaqa_active ON student (halaqa_id, is_active);

ALTER TABLE teacher_attendance
  ADD COLUMN teacher_profile_id uuid REFERENCES teacher_profile(id) ON DELETE SET NULL;

UPDATE teacher_attendance
SET teacher_profile_id = (SELECT id FROM teacher_profile ORDER BY created_at, id LIMIT 1)
WHERE teacher_profile_id IS NULL;

ALTER TABLE teacher_attendance
  DROP CONSTRAINT IF EXISTS teacher_attendance_session_date_session_template_id_key;

ALTER TABLE teacher_attendance
  ADD CONSTRAINT teacher_attendance_unique_teacher_session
  UNIQUE (teacher_profile_id, session_date, session_template_id);

COMMIT;
