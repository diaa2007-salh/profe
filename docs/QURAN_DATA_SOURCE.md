# QURAN_DATA_SOURCE.md

## Current status: verse counts, pages, and thumns are NOT populated

Per spec sections 21-23, inventing this data is explicitly forbidden, and
no verified, appropriately-licensed dataset for Warsh 'an Nafi' verse
counts was sourced and checked during this build. This document exists so
that status is never ambiguous.

## What IS populated

`quran_surah`: 114 rows, `id` (canonical 1-114 order) and `name_ar`
(Arabic surah name). This data is riwayah-independent and uncontroversial
— surah names and their order are the same across Hafs, Warsh, and every
other riwayah. `verse_count` is `NULL` on every row.

## What is NOT populated, and why

`quran_surah.verse_count`, and every row of `mushaf_page` /
`mushaf_thumn`. Reasons this wasn't done rather than approximated:

1. **Warsh and Hafs verse numbering genuinely differ** in a number of
   surahs (confirmed by research during this build, not assumed). Using
   Hafs counts as a stand-in, even temporarily, would silently produce
   wrong validation results for a Warsh-riwayah app, which is worse than
   no validation at all.
2. **Page/thumn boundaries are edition-specific**, not just riwayah-
   specific — two different printed Warsh mushafs can paginate
   differently. The schema reflects this: `mushaf_page` and `mushaf_thumn`
   both key off `mushaf_edition_id`, not off `quran_surah` alone.
3. No dataset was found and verified against the specific bar this
   project needs: labeled as Warsh (not Hafs relabeled), with clear
   licensing, and independently cross-checked rather than trusted from a
   single source.

## What this blocks, concretely

- `WeeklyMemorization` verse-range validation only checks ordering
  (`from <= to`) — the upper-bound check (`verse <= surah's real count`)
  is skipped, and the UI shows "بيانات عدد آيات هذه السورة غير متوفرة بعد"
  instead of a range hint. See `validateVerseRange()` in
  `lib/business/verse-validation.ts` and its `fullyVerified` flag.
- Monthly Follow-up shows "بيانات الصفحات والأثمان غير متوفرة" instead of
  a pages/thumns count.
- `MushafEdition.is_verified` defaults to `false` and nothing in the
  application ever sets it to `true` — that flag is reserved for a real,
  documented data import, not a form submission.

## How to unblock this (the importer interface, spec section 23)

The schema is ready to receive real data without any migration changes:

1. Source a dataset explicitly labeled Warsh 'an Nafi (not Hafs), with a
   clear, permissive-enough license, from more than one independent
   reference where possible (cross-check counts, don't trust a single
   source given the documented Hafs/Warsh differences).
2. Record the source, retrieval date, version, and license **here**, in
   this file, before importing anything.
3. Populate `quran_surah.verse_count` per surah.
4. Create a row in `mushaf_edition` for the specific printed/digital
   edition the page/thumn numbers come from, and set `is_verified = true`
   on it only once the import is spot-checked.
5. Populate `mushaf_page` / `mushaf_thumn` for that edition
   (`(mushaf_edition_id, page_number/thumn_number) -> (surah_id,
   start_verse)`).
6. No application code changes are required — `validateVerseRange()`
   already switches to full validation the moment `verse_count` is
   non-null, and the Monthly Follow-up page already switches to showing
   real numbers the moment matching `mushaf_page`/`mushaf_thumn` rows
   exist for the default edition.
