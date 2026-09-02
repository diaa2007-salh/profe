import { db } from "@/lib/db/client";
import { MemorizationClient } from "./MemorizationClient";

export const dynamic = "force-dynamic";

export default async function MemorizationPage() {
  const [students, surahs, entries] = await Promise.all([
    db.selectFrom("student").select(["id", "fullName"]).where("isActive", "=", true).orderBy("fullName", "asc").execute(),
    db.selectFrom("quranSurah").select(["id", "nameAr", "verseCount"]).orderBy("id", "asc").execute(),
    db
      .selectFrom("weeklyMemorization")
      .innerJoin("student", "student.id", "weeklyMemorization.studentId")
      .select([
        "weeklyMemorization.id",
        "weeklyMemorization.studentId",
        "student.fullName as studentName",
        "weeklyMemorization.weekStart",
        "weeklyMemorization.fromSurahId",
        "weeklyMemorization.fromVerse",
        "weeklyMemorization.toSurahId",
        "weeklyMemorization.toVerse",
        "weeklyMemorization.notes",
      ])
      .orderBy("weeklyMemorization.weekStart", "desc")
      .limit(50)
      .execute(),
  ]);

  const surahNameById = new Map(surahs.map((s) => [s.id, s.nameAr]));
  const enrichedEntries = entries.map((e) => ({
    ...e,
    fromSurahName: surahNameById.get(e.fromSurahId) ?? "?",
    toSurahName: surahNameById.get(e.toSurahId) ?? "?",
  }));

  return <MemorizationClient students={students} surahs={surahs} entries={enrichedEntries} />;
}
