import { redirect } from "next/navigation";
import { getSetupState } from "@/lib/server/app-state";
import { SetupWizard } from "./SetupWizard";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const { isSetUp } = await getSetupState();
  if (isSetUp) redirect("/login");

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary font-display text-xl text-primary-foreground">
            ح
          </div>
          <h1 className="font-display text-2xl text-foreground">مرحبًا بك في دفتر الحلقة</h1>
          <p className="mt-1 text-sm text-muted-foreground">لنقم بإعداد حسابك وحلقتك — خمس خطوات سريعة</p>
        </div>
        <SetupWizard />
      </div>
    </div>
  );
}
