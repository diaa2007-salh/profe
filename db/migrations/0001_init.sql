-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS btree_gist; -- EXCLUDE constraints on daterange

-- ============ Auth / Teacher ============

CREATE TABLE app_user (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE teacher_profile (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL UNIQUE REFERENCES app_user(id) ON DELETE CASCADE,
  full_name      text NOT NULL,
  phone          text,
  halaqa_name    text,
  photo_url      text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ============ Students ============

CREATE TABLE student (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name      text NOT NULL,
  birth_date     date,
  birth_place    text,
  address        text,
  guardian_name  text,
  guardian_phone text,
  photo_url      text,
  is_active      boolean NOT NULL DEFAULT true,
  archived_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_student_active ON student (is_active);

-- ============ Academic calendar ============

CREATE TABLE academic_year (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label       text NOT NULL,             -- "2026/2027"
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  is_active   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academic_year_dates_valid CHECK (end_date > start_date)
);

-- Only one active academic year at a time
CREATE UNIQUE INDEX one_active_academic_year ON academic_year (is_active) WHERE is_active;

CREATE TABLE holiday (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id uuid NOT NULL REFERENCES academic_year(id) ON DELETE CASCADE,
  name         text NOT NULL,
  start_date   date NOT NULL,
  end_date     date NOT NULL,
  description  text,
  date_range   daterange GENERATED ALWAYS AS (daterange(start_date, end_date, '[]')) STORED,
  CONSTRAINT holiday_dates_valid CHECK (end_date >= start_date)
);

CREATE INDEX idx_holiday_range ON holiday USING gist (date_range);

-- ============ Sessions ============

CREATE TABLE session_template (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,             -- "الحصة الأولى"
  start_time  time NOT NULL,
  end_time    time NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  CONSTRAINT session_time_valid CHECK (end_time > start_time)
);

CREATE TABLE session_cancellation (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_template_id uuid REFERENCES session_template(id) ON DELETE CASCADE, -- NULL = all sessions
  start_date         date NOT NULL,
  end_date           date NOT NULL,
  reason             text,
  date_range         daterange GENERATED ALWAYS AS (daterange(start_date, end_date, '[]')) STORED,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cancellation_dates_valid CHECK (end_date >= start_date),
  -- DB-level overlap prevention (spec 14: "prevent or warn about overlap")
  -- Two cancellations for the SAME session_template (or both "all sessions")
  -- cannot have overlapping date ranges.
  EXCLUDE USING gist (
    COALESCE(session_template_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
    date_range WITH &&
  )
);

CREATE INDEX idx_cancellation_range ON session_cancellation USING gist (date_range);

-- ============ Attendance ============

CREATE TYPE attendance_status AS ENUM ('PRESENT', 'ABSENT', 'LATE');
CREATE TYPE teacher_status AS ENUM ('PRESENT', 'ABSENT');

CREATE TABLE teacher_attendance (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_date        date NOT NULL,
  session_template_id uuid NOT NULL REFERENCES session_template(id),
  status              teacher_status NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_date, session_template_id)
);

CREATE TABLE student_attendance (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id          uuid NOT NULL REFERENCES student(id),
  session_date        date NOT NULL,
  session_template_id uuid NOT NULL REFERENCES session_template(id),
  status              attendance_status NOT NULL,
  arrival_time        time,             -- required iff status = LATE (enforced in app + trigger below)
  late_minutes        integer,          -- server-computed, never trusted from client
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, session_date, session_template_id),   -- RULE: idempotency (spec 19)
  CONSTRAINT late_requires_arrival CHECK (
    (status = 'LATE' AND arrival_time IS NOT NULL AND late_minutes IS NOT NULL)
    OR (status <> 'LATE' AND arrival_time IS NULL AND late_minutes IS NULL)
  )
);

CREATE INDEX idx_student_attendance_date ON student_attendance (session_date);
CREATE INDEX idx_student_attendance_student ON student_attendance (student_id);

-- ============ Weekly memorization ============

CREATE TABLE quran_surah (
  id           integer PRIMARY KEY,       -- 1..114, canonical order (riwayah-independent)
  name_ar      text NOT NULL,
  verse_count  integer,                   -- NULL until a verified riwayah-specific source is imported — see docs/QURAN_DATA_SOURCE.md
  source_note  text
);

CREATE TABLE mushaf_edition (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  riwayah     text NOT NULL DEFAULT 'ورش عن نافع',
  publisher   text,
  edition     text,
  description text,
  is_default  boolean NOT NULL DEFAULT false,
  is_verified boolean NOT NULL DEFAULT false  -- true only once page/thumn data has a checked source
);

CREATE TABLE mushaf_page (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mushaf_edition_id uuid NOT NULL REFERENCES mushaf_edition(id) ON DELETE CASCADE,
  page_number       integer NOT NULL,
  surah_id          integer NOT NULL REFERENCES quran_surah(id),
  start_verse       integer NOT NULL,
  UNIQUE (mushaf_edition_id, page_number)
);

CREATE TABLE mushaf_thumn (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mushaf_edition_id uuid NOT NULL REFERENCES mushaf_edition(id) ON DELETE CASCADE,
  thumn_number      integer NOT NULL,   -- 1..240 (30 juz * 8 thumns)
  surah_id          integer NOT NULL REFERENCES quran_surah(id),
  start_verse       integer NOT NULL,
  UNIQUE (mushaf_edition_id, thumn_number)
);

CREATE TABLE weekly_memorization (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    uuid NOT NULL REFERENCES student(id),
  week_start    date NOT NULL,           -- Saturday-anchored week
  from_surah_id integer NOT NULL REFERENCES quran_surah(id),
  from_verse    integer NOT NULL,
  to_surah_id   integer NOT NULL REFERENCES quran_surah(id),
  to_verse      integer NOT NULL,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT verse_range_order CHECK (
    from_surah_id < to_surah_id OR (from_surah_id = to_surah_id AND from_verse <= to_verse)
  )
);

CREATE INDEX idx_weekly_memo_student ON weekly_memorization (student_id, week_start);

-- ============ Monthly evaluation ============

CREATE TYPE evaluation_grade AS ENUM ('EXCELLENT', 'VERY_GOOD', 'GOOD', 'NEEDS_FOLLOW_UP');

CREATE TABLE monthly_evaluation (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid NOT NULL REFERENCES student(id),
  year        integer NOT NULL,
  month       integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  grade       evaluation_grade,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, year, month)
);

-- ============ Settings ============

CREATE TABLE app_settings (
  id    boolean PRIMARY KEY DEFAULT true CHECK (id),  -- singleton row trick
  data  jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
