import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { db } from "@/lib/db/client";

vi.mock("@/lib/auth/config", () => ({
  auth: async () => ({ user: { id: "00000000-0000-0000-0000-000000000001" } }),
}));

const { upsertWeeklyMemorization, deleteWeeklyMemorization } = await import("../actions");

let studentId: string;

function fd(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

beforeAll(async () => {
  const student = await db.insertInto("student").values({ fullName: "TEST-STUDENT-MEMO" }).returning(["id"]).executeTakeFirstOrThrow();
  studentId = student.id;
});

afterAll(async () => {
  await db.deleteFrom("weeklyMemorization").where("studentId", "=", studentId).execute();
  await db.deleteFrom("student").where("id", "=", studentId).execute();
  await db.destroy();
});

describe("weekly memorization integration — real PostgreSQL", () => {
  it("TEST 7 (spec numbering) — Al-Baqarah 255 -> 261 is valid and persists", async () => {
    const result = await upsertWeeklyMemorization(
      fd({ studentId, weekStart: "2026-11-01", fromSurahId: "2", fromVerse: "255", toSurahId: "2", toVerse: "261" })
    );
    expect(result.ok).toBe(true);

    const row = await db.selectFrom("weeklyMemorization").selectAll().where("studentId", "=", studentId).executeTakeFirstOrThrow();
    expect(row.fromVerse).toBe(255);
    expect(row.toVerse).toBe(261);
  });

  it("TEST 9 — Al-Baqarah 261 -> 255 (end before start) is rejected, nothing written", async () => {
    await db.deleteFrom("weeklyMemorization").where("studentId", "=", studentId).execute();
    const result = await upsertWeeklyMemorization(
      fd({ studentId, weekStart: "2026-11-01", fromSurahId: "2", fromVerse: "261", toSurahId: "2", toVerse: "255" })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/[\u0600-\u06FF]/);

    const rows = await db.selectFrom("weeklyMemorization").selectAll().where("studentId", "=", studentId).execute();
    expect(rows).toHaveLength(0);
  });

  it("TEST 8 — Al-Fatiha 1 -> 8 is rejected once verse_count is known to be 7 (set temporarily for this test only)", async () => {
    await db.updateTable("quranSurah").set({ verseCount: 7 }).where("id", "=", 1).execute();
    try {
      const result = await upsertWeeklyMemorization(
        fd({ studentId, weekStart: "2026-11-01", fromSurahId: "1", fromVerse: "1", toSurahId: "1", toVerse: "8" })
      );
      expect(result.ok).toBe(false);
    } finally {
      await db.updateTable("quranSurah").set({ verseCount: null }).where("id", "=", 1).execute();
    }
  });

  it("verse_count NULL (the real current state) -> ordering still checked, no invented max-verse block", async () => {
    const confirmNull = await db.selectFrom("quranSurah").select("verseCount").where("id", "=", 1).executeTakeFirstOrThrow();
    expect(confirmNull.verseCount).toBeNull();

    await db.deleteFrom("weeklyMemorization").where("studentId", "=", studentId).execute();
    const result = await upsertWeeklyMemorization(
      fd({ studentId, weekStart: "2026-11-01", fromSurahId: "1", fromVerse: "1", toSurahId: "1", toVerse: "500" })
    );
    expect(result.ok).toBe(true);
  });

  it("spec 25 — an overlapping range saves (not blocked, earlier record not deleted) and reports the overlap", async () => {
    await db.deleteFrom("weeklyMemorization").where("studentId", "=", studentId).execute();
    await upsertWeeklyMemorization(fd({ studentId, weekStart: "2026-11-01", fromSurahId: "2", fromVerse: "255", toSurahId: "2", toVerse: "261" }));

    const second = await upsertWeeklyMemorization(
      fd({ studentId, weekStart: "2026-11-08", fromSurahId: "2", fromVerse: "260", toSurahId: "2", toVerse: "270" })
    );
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.overlaps.length).toBeGreaterThan(0);

    const rows = await db.selectFrom("weeklyMemorization").selectAll().where("studentId", "=", studentId).execute();
    expect(rows).toHaveLength(2);
  });

  it("editing an existing entry (id supplied) UPDATEs in place rather than inserting a new row", async () => {
    await db.deleteFrom("weeklyMemorization").where("studentId", "=", studentId).execute();
    await upsertWeeklyMemorization(fd({ studentId, weekStart: "2026-11-01", fromSurahId: "3", fromVerse: "1", toSurahId: "3", toVerse: "10" }));
    const existing = await db.selectFrom("weeklyMemorization").selectAll().where("studentId", "=", studentId).executeTakeFirstOrThrow();

    await upsertWeeklyMemorization(
      fd({ id: existing.id, studentId, weekStart: "2026-11-01", fromSurahId: "3", fromVerse: "1", toSurahId: "3", toVerse: "20", notes: "تم التعديل" })
    );

    const rows = await db.selectFrom("weeklyMemorization").selectAll().where("studentId", "=", studentId).execute();
    expect(rows).toHaveLength(1);
    expect(rows[0].toVerse).toBe(20);
    expect(rows[0].notes).toBe("تم التعديل");
  });

  it("delete removes the row", async () => {
    const existing = await db.selectFrom("weeklyMemorization").selectAll().where("studentId", "=", studentId).executeTakeFirstOrThrow();
    await deleteWeeklyMemorization(existing.id);
    const rows = await db.selectFrom("weeklyMemorization").selectAll().where("studentId", "=", studentId).execute();
    expect(rows).toHaveLength(0);
  });

  it("an out-of-range surah id (999) is rejected by Zod validation before it ever reaches the DB", async () => {
    const bad = await upsertWeeklyMemorization(
      fd({ studentId, weekStart: "2026-11-01", fromSurahId: "1", fromVerse: "1", toSurahId: "999", toVerse: "2" })
    );
    expect(bad.ok).toBe(false);
  });
});
