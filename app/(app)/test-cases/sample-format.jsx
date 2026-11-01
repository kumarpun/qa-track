"use client";
import { useState } from "react";
import { Check, Copy, FileText } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const SAMPLE_STEPS = `1. Visit site: https://app.example.com/login
2. Enter Email: qa@example.com
3. Enter Password: Test@1234
4. Click Sign in
5. Text should present: Dashboard`;

/** Badge on the case form and detail page; opens a dialog with an example of how to write steps. */
export function SampleFormat({ className = "" }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SAMPLE_STEPS);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy");
    }
  };
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1 rounded-full border border-ring/50 bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground transition-colors hover:bg-ring/20 ${className}`}
      >
        <FileText className="size-3" /> Test case sample
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Test case sample</DialogTitle>
            <DialogDescription>Write one step per line, numbered, in this format.</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <pre className="whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 pr-10 text-sm" data-testid="case-sample">{SAMPLE_STEPS}</pre>
            <button
              type="button"
              onClick={copy}
              aria-label={copied ? "Copied" : "Copy sample"}
              className="absolute right-2 top-2 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
