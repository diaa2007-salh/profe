import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function MonthlyAttendanceLoading() {
  return (
    <div aria-label="جارٍ تحميل الكشف الشهري" className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-11 w-44 rounded-xl" />
      </div>
      <Card className="rounded-2xl">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-16 rounded-xl" />)}
        </CardContent>
      </Card>
      <div className="space-y-2 overflow-hidden rounded-2xl border border-border/80 bg-card p-4">
        {Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="h-8 w-full" />)}
      </div>
    </div>
  );
}
