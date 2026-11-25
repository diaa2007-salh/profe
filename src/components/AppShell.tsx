"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  Users,
  CalendarCheck2,
  TableProperties,
  Settings2,
  Command as CommandIcon,
  MoreHorizontal,
  LogOut,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOutAction } from "@/app/(app)/actions";

interface NavItem {
  href: string;
  label: string;
  icon: typeof Home;
  mobileLabel?: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "الرئيسية", icon: Home },
  { href: "/attendance", label: "الحضور اليومي", mobileLabel: "الحضور", icon: CalendarCheck2 },
  { href: "/monthly", label: "الكشف الشهري", mobileLabel: "الشهر", icon: TableProperties },
  { href: "/students", label: "الطلاب", mobileLabel: "الطلاب", icon: Users },
  { href: "/settings", label: "الإعدادات", icon: Settings2 },
];

const MOBILE_NAV_ITEMS = NAV_ITEMS.filter((item) => item.href !== "/");

function isActiveHref(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function AppShell({
  teacherName,
  role,
  halaqaNames,
  children,
}: {
  teacherName?: string;
  role: "ADMIN" | "TEACHER";
  halaqaNames: string[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="flex min-h-dvh w-full overflow-hidden bg-background md:h-dvh">
      <aside className="hidden w-72 shrink-0 flex-col border-l border-border/80 bg-card md:flex">
        <div className="flex items-center gap-3 px-6 py-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground font-display text-lg shadow-sm">
            ح
          </div>
          <div>
            <div className="font-display text-lg leading-tight text-foreground">دفتر الحلقة</div>
            <div className="mt-1 text-xs text-muted-foreground">{teacherName ?? "إدارة الانضباط"}</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = isActiveHref(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm transition-all duration-150 ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-foreground/75 hover:bg-secondary hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={isActive ? 2.5 : 2} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mx-4 mb-3 rounded-2xl border border-border/80 bg-background p-3">
          <div className="truncate text-sm font-medium text-foreground">{teacherName ?? "المستخدم"}</div>
          <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{role === "ADMIN" ? "مسؤول النظام" : "معلم"}</span>
            {halaqaNames.length > 0 && (
              <span className="max-w-32 truncate rounded-full bg-secondary px-2 py-0.5">
                {halaqaNames.join("، ")}
              </span>
            )}
          </div>
        </div>

        <button
          onClick={() => setPaletteOpen(true)}
          className="mx-3 mb-3 flex min-h-11 items-center justify-between rounded-xl border border-border/80 bg-background px-3 py-2 text-xs text-muted-foreground transition-all duration-150 hover:border-primary/40 hover:text-foreground"
        >
          <span className="flex items-center gap-2">
            <CommandIcon className="h-3.5 w-3.5" /> بحث سريع
          </span>
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-sans text-[10px]">Ctrl K</kbd>
        </button>

        <form action={signOutAction} className="mx-3 mb-5">
          <button className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-secondary">
            <LogOut className="h-3.5 w-3.5" />
            تسجيل الخروج
          </button>
        </form>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-border/80 bg-card px-4 py-3 md:hidden">
          <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground font-display">
            ح
          </div>
          <div>
            <div className="font-display text-base leading-tight text-foreground">دفتر الحلقة</div>
            <div className="text-[11px] text-muted-foreground">{role === "ADMIN" ? "مسؤول النظام" : "معلم"}</div>
          </div>
          </div>
          <div className="flex items-center gap-2">
            {halaqaNames[0] && <span className="max-w-32 truncate rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground">{halaqaNames[0]}</span>}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button aria-label="المزيد من الخيارات" className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary">
                  <MoreHorizontal className="h-5 w-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="bottom" className="mt-2">
                <DropdownMenuItem asChild>
                  <form action={signOutAction} className="w-full">
                    <button type="submit" className="flex min-h-9 w-full items-center text-destructive">
                      <LogOut className="me-2 h-4 w-4" />
                      تسجيل الخروج
                    </button>
                  </form>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto pb-24 md:pb-0">
          <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 md:px-8 md:py-8">{children}</div>
        </main>
      </div>

      <nav aria-label="التنقل الرئيسي" className="fixed inset-x-0 bottom-0 z-20 flex border-t border-border/80 bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-18px_rgba(15,23,42,0.3)] backdrop-blur md:hidden">
        {MOBILE_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = isActiveHref(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] transition-colors duration-150 ${
                isActive ? "font-semibold text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
              {item.mobileLabel ?? item.label}
            </Link>
          );
        })}
      </nav>

      <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen}>
        <CommandInput placeholder="ابحث عن صفحة أو إجراء..." />
        <CommandList>
          <CommandEmpty>لا توجد نتائج</CommandEmpty>
          <CommandGroup heading="الانتقال إلى">
            {NAV_ITEMS.map((item) => (
              <CommandItem
                key={item.href}
                onSelect={() => {
                  setPaletteOpen(false);
                  router.push(item.href);
                }}
              >
                <item.icon className="ms-2 h-4 w-4" />
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}
