import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { getSetupState, getTeacherProfile } from "@/lib/server/app-state";
import { getAccessContext } from "@/lib/server/access";
import { AppShell } from "@/components/AppShell";

// Every page here reads real-time DB state (today's attendance, live
// counts). Without this, Next.js may prerender a page like "/" as static
// HTML at build time and serve a frozen snapshot to every visitor instead
// of live data — caught by actually running `next build` and inspecting
// its route output, not by typecheck.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { isSetUp } = await getSetupState();
  if (!isSetUp) redirect("/setup");

  // Defense in depth: proxy.ts already redirects unauthenticated requests to
  // /login for every path this layout covers, but this route segment (and
  // every server action inside it) checks again rather than trusting the
  // proxy alone — see docs/BUSINESS_RULES.md.
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [teacher, access] = await Promise.all([
    getTeacherProfile(session.user.id),
    getAccessContext(),
  ]);
  const halaqas = access.halaqaIds.length
    ? await db.selectFrom("halaqa").select("name").where("id", "in", access.halaqaIds).orderBy("name").execute()
    : [];

  return (
    <AppShell
      teacherName={teacher?.fullName}
      role={access.role}
      halaqaNames={halaqas.map(({ name }) => name)}
    >
      {children}
    </AppShell>
  );
}
