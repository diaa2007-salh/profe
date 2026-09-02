import { describe, it, expect } from "vitest";
import { validateVerseRange, rangesOverlap, type SurahInfo } from "../verse-validation";

// Test fixture only — NOT production data. Al-Fatiha (surah 1) has 7 verses
// under every riwayah, which is why it's usable here without touching the
// still-unverified verse_count column. Al-Baqarah (surah 2) is stubbed at
// 286 purely to exercise the "exceeds max verse" path; production code must
// read verse_count from the database (nullable) rather than a fixture map.
const FIXTURE_SURAHS = new Map<number, SurahInfo>([
  [1, { id: 1, verseCount: 7 }],
  [2, { id: 2, verseCount: 286 }],
]);

const UNVERIFIED_SURAHS = new Map<number, SurahInfo>([
  [1, { id: 1, verseCount: null }],
  [2, { id: 2, verseCount: null }],
]);

describe("validateVerseRange — spec acceptance tests 7-9", () => {
  it("TEST 7 — Al-Baqarah 255 -> 261 is valid", () => {
    const result = validateVerseRange({ fromSurahId: 2, fromVerse: 255, toSurahId: 2, toVerse: 261 }, FIXTURE_SURAHS);
    expect(result.valid).toBe(true);
  });

  it("TEST 8 — Al-Fatiha 1 -> 8 is invalid (surah only has 7 verses)", () => {
    const result = validateVerseRange({ fromSurahId: 1, fromVerse: 1, toSurahId: 1, toVerse: 8 }, FIXTURE_SURAHS);
    expect(result.valid).toBe(false);
  });

  it("TEST 9 — Al-Baqarah 261 -> 255 is invalid (end before start)", () => {
    const result = validateVerseRange({ fromSurahId: 2, fromVerse: 261, toSurahId: 2, toVerse: 255 }, FIXTURE_SURAHS);
    expect(result.valid).toBe(false);
  });

  it("end-of-surah exact boundary is valid (regression guard: off-by-one)", () => {
    const result = validateVerseRange({ fromSurahId: 1, fromVerse: 1, toSurahId: 1, toVerse: 7 }, FIXTURE_SURAHS);
    expect(result.valid).toBe(true);
  });

  it("when verse_count isn't populated yet, ordering is still checked but fullyVerified is false", () => {
    const badOrder = validateVerseRange({ fromSurahId: 2, fromVerse: 261, toSurahId: 2, toVerse: 255 }, UNVERIFIED_SURAHS);
    expect(badOrder.valid).toBe(false); // ordering doesn't need verse_count

    const goodOrderUnverified = validateVerseRange(
      { fromSurahId: 1, fromVerse: 1, toSurahId: 1, toVerse: 999 },
      UNVERIFIED_SURAHS
    );
    expect(goodOrderUnverified.valid).toBe(true);
    expect(goodOrderUnverified.fullyVerified).toBe(false); // caller must show "not verified yet", not treat as confirmed
  });

  it("rejects unknown surah ids", () => {
    const result = validateVerseRange({ fromSurahId: 999, fromVerse: 1, toSurahId: 999, toVerse: 2 }, FIXTURE_SURAHS);
    expect(result.valid).toBe(false);
  });
});

describe("rangesOverlap — spec TEST 10", () => {
  it("TEST 10 — Al-Baqarah 255-261 then 260-270 overlap", () => {
    const a = { fromSurahId: 2, fromVerse: 255, toSurahId: 2, toVerse: 261 };
    const b = { fromSurahId: 2, fromVerse: 260, toSurahId: 2, toVerse: 270 };
    expect(rangesOverlap(a, b)).toBe(true);
  });

  it("adjacent, non-overlapping ranges do not overlap", () => {
    const a = { fromSurahId: 2, fromVerse: 1, toSurahId: 2, toVerse: 20 };
    const b = { fromSurahId: 2, fromVerse: 21, toSurahId: 2, toVerse: 40 };
    expect(rangesOverlap(a, b)).toBe(false);
  });

  it("ranges spanning different surahs overlap correctly using surah order", () => {
    const a = { fromSurahId: 1, fromVerse: 1, toSurahId: 2, toVerse: 5 };
    const b = { fromSurahId: 2, fromVerse: 1, toSurahId: 2, toVerse: 3 };
    expect(rangesOverlap(a, b)).toBe(true);
  });
});
