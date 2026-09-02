"use client"

import type { ReactNode } from "react";

/**
 * Multi-group digit strings — phone numbers ("0555 11 22 33"), time ranges
 * ("18:00 – 20:00") — get their space/dash-separated groups reordered by
 * the browser's bidi algorithm when embedded in RTL paragraph text (e.g.
 * "18:00 – 20:00" renders as "20:00 – 18:00"). Wrapping in dir="ltr"
 * isolates the run so it always displays left-to-right, as written.
 */
export function Ltr({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span dir="ltr" className={`inline-block tabular ${className}`}>
      {children}
    </span>
  );
}
