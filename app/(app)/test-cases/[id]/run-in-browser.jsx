"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { runCaseInBrowser, showRunError } from "@/lib/client/browser-run";
import { Button } from "@/components/ui/button";
import { BrowserRunOptions, useBrowserOptions } from "@/components/browser-run-options";

/** Opens a real browser window on the machine running this server and executes the case steps. */
export function RunInBrowser({ projectId, caseId }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [opts, update] = useBrowserOptions();
  const go = () =>
    start(async () => {
      const res = await runCaseInBrowser(projectId, caseId, opts);
      if (!res.ok) return showRunError(res.error);
      if (res.data.status === "PASSED") toast.success("Browser run passed. Case marked Passed.");
      else toast.error(`Browser run failed: ${res.data.failedAt ?? "see log"}. Case marked Failed.`);
      router.refresh();
    });
  return (
    <>
      <BrowserRunOptions opts={opts} update={update} disabled={pending} />
      <Button variant="outline" size="sm" disabled={pending} onClick={go}>
        {pending ? <Loader2 className="animate-spin" /> : <Play />} {pending ? "Running…" : "Run in browser"}
      </Button>
    </>
  );
}
