"use client";
import { useEffect, useState } from "react";
import { ArrowRight, Check, Copy, MonitorOff } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RUNNER_UNREACHABLE_EVENT, DOCS_RUNNER_HREF, PUBLIC_APP_URL } from "@/lib/client/runner-events";

/** Centered popup shown when "My machine" is chosen but the local runner is not running. Mounted once in the root layout. */
export function RunnerUnreachableDialog() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const show = () => { setCopied(false); setOpen(true); };
    window.addEventListener(RUNNER_UNREACHABLE_EVENT, show);
    return () => window.removeEventListener(RUNNER_UNREACHABLE_EVENT, show);
  }, []);

  const command = `npx testtrack-runner --origin ${PUBLIC_APP_URL}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(command); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked: user can select the text */ }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="items-center text-center">
          <div className="mb-1 flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <MonitorOff className="size-6" />
          </div>
          <DialogTitle className="text-lg">Local runner is not running</DialogTitle>
          <DialogDescription>
            <em>My machine</em> needs a small helper running on your computer. Start it, keep the terminal open, then press Run in browser again.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Run this in your terminal</p>
          <div className="flex items-center gap-2 rounded-lg border bg-muted/50 py-2 pl-3 pr-2">
            <code className="min-w-0 flex-1 break-all font-mono text-xs">{command}</code>
            <Button type="button" variant="ghost" size="icon-sm" onClick={copy} aria-label="Copy command">
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Needs Node.js 20 or newer. The first run downloads Chromium once.</p>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Close</Button>
          <Button type="button" onClick={() => { setOpen(false); window.open(DOCS_RUNNER_HREF, "_blank"); }}>
            Open setup guide <ArrowRight className="size-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
