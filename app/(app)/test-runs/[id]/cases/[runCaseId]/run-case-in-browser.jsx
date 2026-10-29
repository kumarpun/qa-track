"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { runRunCaseInBrowserAction } from "@/app/actions/automation";
import { Button } from "@/components/ui/button";
import { BrowserRunOptions, useBrowserOptions } from "@/components/browser-run-options";

/** Runs this run case's frozen steps in a real browser on the server machine and records the outcome as an execution. */
export function RunCaseInBrowser({ projectId, runCaseId }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [opts, update] = useBrowserOptions();
  const go = () =>
    start(async () => {
      const res = await runRunCaseInBrowserAction(projectId, runCaseId, opts);
      if (!res.ok) return toast.error(res.error);
      if (res.data.status === "PASSED") toast.success("Browser run passed. Result recorded as Passed.");
      else toast.error(`Browser run failed: ${res.data.failedAt ?? "see comment"}. Result recorded as Failed.`);
      router.refresh();
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <BrowserRunOptions opts={opts} update={update} disabled={pending} />
      <Button variant="outline" size="sm" disabled={pending} onClick={go}>
        {pending ? <Loader2 className="animate-spin" /> : <Play />} {pending ? "Running…" : "Run in browser"}
      </Button>
    </div>
  );
}
