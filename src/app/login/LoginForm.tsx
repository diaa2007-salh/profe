"use client";

import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { loginAction, type LoginFormState } from "./actions";

const initialState: LoginFormState = {};

export function LoginForm() {
  return (
    <Suspense fallback={<Card><CardContent className="py-6 text-sm text-muted-foreground">جارِ التحميل...</CardContent></Card>}>
      <LoginFormInner />
    </Suspense>
  );
}

function LoginFormInner() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";

  return (
    <Card>
      <CardContent className="py-6">
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          <div className="space-y-1.5">
            <Label htmlFor="email">البريد الإلكتروني</Label>
            <Input id="email" name="email" type="email" dir="ltr" required autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">كلمة المرور</Label>
            <Input id="password" name="password" type="password" required />
          </div>
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" disabled={pending} className="w-full gap-1.5">
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            دخول
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
