-- DESTRUCTIVE: permanently removes historical study tracking/reference data.
-- Do not apply to production until an external backup has been verified and
-- the owner has explicitly approved this irreversible operation.
BEGIN;

DROP TABLE IF EXISTS weekly_memorization;
DROP TABLE IF EXISTS monthly_evaluation;
DROP TABLE IF EXISTS mushaf_page;
DROP TABLE IF EXISTS mushaf_thumn;
DROP TABLE IF EXISTS mushaf_edition;
DROP TABLE IF EXISTS quran_surah;
DROP TYPE IF EXISTS evaluation_grade;

COMMIT;
