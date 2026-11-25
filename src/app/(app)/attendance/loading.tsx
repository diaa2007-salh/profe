import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function AttendanceLoading() {
  return (
    <div aria-label="جارٍ تحميل كشف الحضور" className="space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-card p-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-11 w-40 rounded-xl" />
          <Skeleton className="h-11 w-52 rounded-xl" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-20 rounded-2xl" />)}
      </div>
      <Card className="rounded-2xl">
        <CardContent className="space-y-3 p-4">
          <Skeleton className="h-11 w-full rounded-xl" />
          <Skeleton className="h-9 w-72 rounded-full" />
        </CardContent>
      </Card>
      {Array.from({ length: 5 }, (_, index) => (
        <Card key={index} className="rounded-2xl">
          <CardContent className="flex items-center justify-between p-4">
            <Skeleton className="h-10 w-40" />
            <Skeleton className="h-11 w-64 rounded-xl" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
