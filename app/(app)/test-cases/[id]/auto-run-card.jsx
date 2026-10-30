"use client";
import { useState } from "react";
import { ChevronRight } from "lucide-react";

/** Browser-run card: the header (result, time, who) is always shown; the step log and screenshot expand below it (collapsed by default). */
export function AutoRunCard({ header, children }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-lg border text-sm" data-testid="auto-run">
      <button type="button" aria-expanded={open} aria-label="Browser run details" onClick={() => setOpen((o) => !o)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg p-3 text-left hover:bg-muted/50">
        <ChevronRight className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
        {header}
      </button>
      {open && <div className="space-y-2 px-3 pb-3">{children}</div>}
    </li>
  );
}
