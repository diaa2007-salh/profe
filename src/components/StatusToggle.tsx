"use client"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { AttendanceStatus } from "@/lib/types";
import { STATUS_LABEL } from "@/lib/domain";

const STYLES: Record<AttendanceStatus, string> = {
  present: "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:border-primary",
  late: "data-[state=on]:bg-accent data-[state=on]:text-accent-foreground data-[state=on]:border-accent",
  absent: "data-[state=on]:bg-destructive data-[state=on]:text-destructive-foreground data-[state=on]:border-destructive",
};

const ORDER: AttendanceStatus[] = ["present", "late", "absent"];

export function StatusToggle({
  value,
  onChange,
  disabled = false,
}: {
  value: AttendanceStatus;
  onChange: (v: AttendanceStatus) => void;
  disabled?: boolean;
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as AttendanceStatus)}
      disabled={disabled}
      className="justify-start gap-1.5"
    >
      {ORDER.map((s) => (
        <ToggleGroupItem
          key={s}
          value={s}
          className={`h-10 min-w-[4.25rem] rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground/70 ${STYLES[s]}`}
        >
          {STATUS_LABEL[s]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
