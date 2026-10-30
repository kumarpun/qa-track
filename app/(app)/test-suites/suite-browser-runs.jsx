"use client";
import { createContext, useContext, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { runCaseInBrowserAction, suiteCaseIdsAction } from "@/app/actions/automation";
import { Button } from "@/components/ui/button";
import { BrowserRunOptions, useBrowserOptions } from "@/components/browser-run-options";

const Ctx = createContext(null);

/** Shares one "a browser run is in progress" state across the row buttons and the bulk button, so only one run happens at a time. */
export function SuiteRunProvider({ projectId, children }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [opts, update] = useBrowserOptions();
  const [active, setActive] = useState(null); // { key, done, total }

  /** Runs every case of the given suites one after another (a case in several suites runs once). */
  const run = (key, suiteIds) =>
    start(async () => {
      const found = await suiteCaseIdsAction(projectId, suiteIds);
      if (!found.ok) return toast.error(found.error);
      const caseIds = [...new Set(suiteIds.flatMap((id) => found.data[id] ?? []))];
      if (!caseIds.length) return toast.error("No test cases to run.");
      let passed = 0;
      const problems = [];
      for (const [i, id] of caseIds.entries()) {
        setActive({ key, done: i, total: caseIds.length });
        const res = await runCaseInBrowserAction(projectId, id, opts);
        if (!res.ok) problems.push(res.error);
        else if (res.data.status === "PASSED") passed++;
        else problems.push(res.data.failedAt ?? "failed");
      }
      setActive(null);
      const failed = caseIds.length - passed;
      if (failed === 0) toast.success(`All ${passed} cases passed.`);
      else toast.error(`${passed} of ${caseIds.length} passed. ${failed} not passed: ${problems.slice(0, 2).join(" | ")}`);
      router.refresh();
    });

  return <Ctx.Provider value={{ run, pending, active, opts, update }}>{children}</Ctx.Provider>;
}

const useRuns = () => useContext(Ctx);

/** Per-row play icon: runs that one suite's cases. */
export function RunSuiteIcon({ suiteId, suiteName, caseCount }) {
  const { run, pending, active } = useRuns();
  const mine = active?.key === suiteId;
  return (
    <Button variant="ghost" size="icon-sm" disabled={pending || caseCount === 0}
      aria-label={`Run suite ${suiteName} in browser`} title={mine ? `Running ${active.done + 1}/${active.total}…` : "Run in browser"}
      onClick={() => run(suiteId, [suiteId])}>
      {mine ? <Loader2 className="animate-spin" /> : <Play />}
    </Button>
  );
}

/** Header button: runs the cases of every listed suite. */
export function RunAllSuites({ suiteIds }) {
  const { run, pending, active, opts, update } = useRuns();
  const mine = active?.key === "all";
  return (
    <>
      <BrowserRunOptions opts={opts} update={update} disabled={pending} />
      <Button variant="outline" size="sm" disabled={pending || suiteIds.length === 0} onClick={() => run("all", suiteIds)}>
        {mine ? <Loader2 className="animate-spin" /> : <Play />} {mine ? `Running ${active.done + 1}/${active.total}…` : "Run all in browser"}
      </Button>
    </>
  );
}
