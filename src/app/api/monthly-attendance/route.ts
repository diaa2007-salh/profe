import { z } from "zod";
import { getAccessContext } from "@/lib/server/access";
import { getMonthlyAttendanceTable } from "@/lib/server/monthly-attendance";

const querySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  halaqaId: z.string().uuid().optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    year: url.searchParams.get("year"),
    month: url.searchParams.get("month"),
    halaqaId: url.searchParams.get("halaqaId") || undefined,
  });
  if (!parsed.success) return Response.json({ error: "بيانات الشهر غير صالحة" }, { status: 400 });

  let access;
  try {
    access = await getAccessContext();
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return Response.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
    }
    throw error;
  }

  if (parsed.data.halaqaId && access.role !== "ADMIN" && !access.halaqaIds.includes(parsed.data.halaqaId)) {
    return Response.json({ error: "غير مصرح بالوصول إلى هذه الحلقة" }, { status: 403 });
  }

  const table = await getMonthlyAttendanceTable(parsed.data.year, parsed.data.month, parsed.data.halaqaId, access);
  return Response.json(table, { headers: { "Cache-Control": "private, no-store" } });
}
