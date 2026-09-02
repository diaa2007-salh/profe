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
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary font-display text-xl text-primary-foreground">
            ح
          </div>
          <h1 className="font-display text-2xl text-foreground">دفتر الحلقة</h1>
          <p className="mt-1 text-sm text-muted-foreground">تسجيل الدخول</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
