"use client"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { AttendanceStatus } from "@/lib/types";
import { STATUS_LABEL } from "@/lib/domain";

const STYLES: Record<AttendanceStatus, string> = {
  present: "data-[state=on]:border-emerald-600 data-[state=on]:bg-emerald-600 data-[state=on]:text-white",
  late: "data-[state=on]:border-amber-600 data-[state=on]:bg-amber-600 data-[state=on]:text-white",
  absent: "data-[state=on]:border-rose-600 data-[state=on]:bg-rose-600 data-[state=on]:text-white",
};

const ORDER: AttendanceStatus[] = ["present", "late", "absent"];

export function StatusToggle({
  value,
  onChange,
  disabled = false,
}: {
  value: AttendanceStatus | null;
  onChange: (v: AttendanceStatus) => void;
  disabled?: boolean;
}) {
  return (
    <ToggleGroup
      type="single"
      value={value ?? ""}
      onValueChange={(v) => v && onChange(v as AttendanceStatus)}
      disabled={disabled}
      className="justify-start gap-1.5"
    >
      {ORDER.map((s) => (
        <ToggleGroupItem
          key={s}
          value={s}
          className={`min-h-11 min-w-[4.25rem] rounded-xl border border-border/80 bg-background px-3 text-xs font-medium text-foreground/70 transition-all duration-150 hover:bg-secondary ${STYLES[s]}`}
        >
          {STATUS_LABEL[s]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
