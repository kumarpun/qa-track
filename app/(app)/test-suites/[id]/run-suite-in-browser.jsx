"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { runCaseInBrowser } from "@/lib/client/browser-run";
import { Button } from "@/components/ui/button";
import { BrowserRunOptions, useBrowserOptions } from "@/components/browser-run-options";

/** Runs every case of the suite in a real browser, one after another, and reports a summary. */
export function RunSuiteInBrowser({ projectId, caseIds }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [progress, setProgress] = useState(0);
  const [opts, update] = useBrowserOptions();
  const go = () =>
    start(async () => {
      let passed = 0;
      const problems = [];
      for (const [i, id] of caseIds.entries()) {
        setProgress(i + 1);
        const res = await runCaseInBrowser(projectId, id, opts);
        if (!res.ok) problems.push(res.error);
        else if (res.data.status === "PASSED") passed++;
        else problems.push(res.data.failedAt ?? "failed");
      }
      const failed = caseIds.length - passed;
      if (failed === 0) toast.success(`All ${passed} cases passed.`);
      else toast.error(`${passed} of ${caseIds.length} passed. ${failed} not passed: ${problems.slice(0, 2).join(" | ")}`);
      router.refresh();
    });
  return (
    <>
      <BrowserRunOptions opts={opts} update={update} disabled={pending} />
      <Button variant="outline" size="sm" disabled={pending || caseIds.length === 0} onClick={go}>
        {pending ? <Loader2 className="animate-spin" /> : <Play />} {pending ? `Running ${progress}/${caseIds.length}…` : "Run in browser"}
      </Button>
    </>
  );
}
