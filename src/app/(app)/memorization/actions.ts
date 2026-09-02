"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { weeklyMemorizationSchema } from "@/lib/validation";
import { validateVerseRange, rangesOverlap, type SurahInfo, type VerseRange } from "@/lib/business/verse-validation";

async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");
}

export type OverlapInfo = { weekStart: string; surahFrom: string; surahTo: string };
export type MemorizationActionResult =
  | { ok: true; overlaps: OverlapInfo[]; fullyVerified: boolean }
  | { ok: false; error: string };

async function loadSurahMap(): Promise<Map<number, SurahInfo>> {
  const rows = await db.selectFrom("quranSurah").select(["id", "verseCount"]).execute();
  return new Map(rows.map((r) => [r.id, { id: r.id, verseCount: r.verseCount }]));
}

export async function upsertWeeklyMemorization(formData: FormData): Promise<MemorizationActionResult> {
  await requireSession();

  const parsed = weeklyMemorizationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" };
  }
  const d = parsed.data;

  const surahs = await loadSurahMap();
  const range: VerseRange = { fromSurahId: d.fromSurahId, fromVerse: d.fromVerse, toSurahId: d.toSurahId, toVerse: d.toVerse };
  const validation = validateVerseRange(range, surahs);
  if (!validation.valid) {
    return { ok: false, error: validation.error ?? "نطاق آيات غير صالح" };
  }

  // Overlap is a warning, never a block, and never deletes the earlier
  // record (spec 25) — collect anything that overlaps so the UI can show
  // it, but proceed with the save regardless.
  const existing = await db
    .selectFrom("weeklyMemorization")
    .select(["id", "weekStart", "fromSurahId", "fromVerse", "toSurahId", "toVerse"])
    .where("studentId", "=", d.studentId)
    .$if(Boolean(d.id), (qb) => qb.where("id", "!=", d.id!))
    .execute();

  const overlapping = existing.filter((e) =>
    rangesOverlap(range, { fromSurahId: e.fromSurahId, fromVerse: e.fromVerse, toSurahId: e.toSurahId, toVerse: e.toVerse })
  );

  try {
    if (d.id) {
      await db
        .updateTable("weeklyMemorization")
        .set({
          weekStart: d.weekStart,
          fromSurahId: d.fromSurahId,
          fromVerse: d.fromVerse,
          toSurahId: d.toSurahId,
          toVerse: d.toVerse,
          notes: d.notes || null,
          updatedAt: new Date(),
        })
        .where("id", "=", d.id)
        .execute();
    } else {
      await db
        .insertInto("weeklyMemorization")
        .values({
          studentId: d.studentId,
          weekStart: d.weekStart,
          fromSurahId: d.fromSurahId,
          fromVerse: d.fromVerse,
          toSurahId: d.toSurahId,
          toVerse: d.toVerse,
          notes: d.notes || null,
        })
        .execute();
    }
  } catch (err) {
    console.error("[memorization] upsert failed", err);
    return { ok: false, error: "تعذّر حفظ التسميع" };
  }

  revalidatePath("/memorization");

  const surahNames = await db.selectFrom("quranSurah").select(["id", "nameAr"]).execute();
  const nameById = new Map(surahNames.map((s) => [s.id, s.nameAr]));

  return {
    ok: true,
    fullyVerified: validation.fullyVerified,
    overlaps: overlapping.map((o) => ({
      weekStart: o.weekStart,
      surahFrom: nameById.get(o.fromSurahId) ?? "?",
      surahTo: nameById.get(o.toSurahId) ?? "?",
    })),
  };
}

export async function deleteWeeklyMemorization(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSession();
  await db.deleteFrom("weeklyMemorization").where("id", "=", id).execute();
  revalidatePath("/memorization");
  return { ok: true };
}
