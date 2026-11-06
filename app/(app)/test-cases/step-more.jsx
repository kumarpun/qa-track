"use client";
import { useState } from "react";

/** A step's first line (already rendered by the caller as `children`) plus its extra lines, collapsed to "…" until "See more" is clicked. */
export function StepMore({ extra, children }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <p className="whitespace-pre-wrap">
        {children}
        {!open && <span aria-hidden="true"> …</span>}{" "}
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="text-xs font-medium text-primary underline underline-offset-2">
          {open ? "See less" : "See more"}
        </button>
      </p>
      <p hidden={!open} className="mt-1 whitespace-pre-wrap border-l-2 border-muted pl-3 text-muted-foreground" data-testid="step-more">{extra}</p>
    </>
  );
}
