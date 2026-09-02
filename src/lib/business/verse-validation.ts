export interface SurahInfo {
  id: number; // 1..114, canonical order
  verseCount: number | null; // null = not yet verified for the active riwayah
}

export interface VerseRange {
  fromSurahId: number;
  fromVerse: number;
  toSurahId: number;
  toVerse: number;
}

export interface VerseValidationResult {
  valid: boolean;
  error?: string;
  /** false if we could not fully check max-verse bounds because verse_count
   *  isn't populated yet for one of the surahs involved — ordering is still
   *  checked either way, but the caller should surface this distinction
   *  rather than silently treating an unchecked range as fully valid. */
  fullyVerified: boolean;
}

/** A sortable position across the whole mushaf without needing real verse
 *  counts: surah order dominates, and 300 safely exceeds the longest surah
 *  (Al-Baqarah, 286-ish depending on riwayah) so verse never overflows into
 *  the next surah's block. Used only for ordering/overlap comparisons. */
function position(surahId: number, verse: number): number {
  return surahId * 300 + verse;
}

export function validateVerseRange(range: VerseRange, surahs: Map<number, SurahInfo>): VerseValidationResult {
  const { fromSurahId, fromVerse, toSurahId, toVerse } = range;

  if (fromVerse < 1 || toVerse < 1) {
    return { valid: false, error: "رقم الآية يجب أن يكون 1 أو أكثر", fullyVerified: true };
  }

  if (position(fromSurahId, fromVerse) > position(toSurahId, toVerse)) {
    return { valid: false, error: "نقطة البداية تأتي بعد نقطة النهاية", fullyVerified: true };
  }

  const fromSurah = surahs.get(fromSurahId);
  const toSurah = surahs.get(toSurahId);
  if (!fromSurah || !toSurah) {
    return { valid: false, error: "سورة غير معروفة", fullyVerified: true };
  }

  if (fromSurah.verseCount === null || toSurah.verseCount === null) {
    // Ordering already checked above — just can't confirm the upper bound yet.
    return { valid: true, fullyVerified: false };
  }

  if (fromVerse > fromSurah.verseCount || toVerse > toSurah.verseCount) {
    return { valid: false, error: "رقم الآية يتجاوز عدد آيات السورة", fullyVerified: true };
  }

  return { valid: true, fullyVerified: true };
}

/** spec 25: overlap is a warning, never a block, and never deletes data. */
export function rangesOverlap(a: VerseRange, b: VerseRange): boolean {
  const aStart = position(a.fromSurahId, a.fromVerse);
  const aEnd = position(a.toSurahId, a.toVerse);
  const bStart = position(b.fromSurahId, b.fromVerse);
  const bEnd = position(b.toSurahId, b.toVerse);
  return aStart <= bEnd && bStart <= aEnd;
}
