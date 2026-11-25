import { redirect } from "next/navigation";
import { getSetupState } from "@/lib/server/app-state";
import { LoginForm } from "./LoginForm";

// See the identical note in (app)/layout.tsx: a plain DB read doesn't
// trigger Next's automatic dynamic-rendering detection the way cookies()/
// headers() do, so without this, the isSetUp check below could be baked
// into a static page at build time and never re-evaluated at runtime.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // First-run: no account exists anywhere yet, so there is nothing to log
  // into. /setup is the only path that can create it. Without this check,
  // proxy.ts's "no session -> /login" rule stands between a fresh install
  // and the only page that can ever create the first session.
  const { isSetUp } = await getSetupState();
  if (!isSetUp) redirect("/setup");

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute -top-32 -start-24 h-80 w-80 rounded-full bg-emerald-500/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-36 -end-24 h-96 w-96 rounded-full bg-amber-400/10 blur-3xl" />
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary font-display text-2xl text-primary-foreground shadow-lg shadow-primary/15">
            ح
          </div>
          <h1 className="font-display text-2xl text-foreground">دفتر الحلقة</h1>
          <p className="mt-2 text-sm text-muted-foreground">متابعة يومية سهلة وواضحة لانضباط التلاميذ</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
