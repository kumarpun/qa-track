"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CASE_STATUSES } from "@/lib/validation/testcase";
import { fillSuiteStatusAction, setSuiteStatusAction } from "@/app/actions/suites";
import { NativeSelect } from "@/components/native-select";
import { FillHandle } from "@/components/fill-handle";
import { cn } from "@/lib/utils";
import { CASE_STATUS_LABELS } from "../test-cases/labels";
import { FILL } from "../test-cases/[id]/status-select";

/**
 * Suite result cell. The shown value is derived from the suite's cases (any failure => Fail);
 * choosing one here sets every case in the suite to that status.
 */
export function SuiteStatusSelect({ projectId, suiteId, suiteName, status, caseCount }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(status);
  const [seen, setSeen] = useState(status);
  if (seen !== status) { setSeen(status); setValue(status); } // server value changed after refresh

  const change = (next) => {
    const prev = value;
    setValue(next);
    start(async () => {
      const res = await setSuiteStatusAction(projectId, suiteId, next);
      if (!res.ok) {
        setValue(prev);
        return toast.error(res.error);
      }
      toast.success(`Updated ${res.data.affected} of ${res.data.total} test case(s)`);
      router.refresh();
    });
  };

  const fill = (ids) =>
    start(async () => {
      const res = await fillSuiteStatusAction(projectId, [suiteId, ...ids], value);
      if (!res.ok) return toast.error(res.error);
      toast.success(`Updated ${res.data.affected} of ${res.data.total} test case(s)`);
      router.refresh();
    });

  const select = (
    <NativeSelect
      aria-label={`Result for suite ${suiteName}`}
      value={value}
      disabled={pending || caseCount === 0}
      title={caseCount === 0 ? "Add test cases to this suite first" : "Sets every test case in the suite"}
      onChange={(e) => change(e.target.value)}
      className={cn("w-full rounded-none border-0 border-transparent bg-transparent px-2.5 font-medium dark:bg-transparent", FILL[value])}
    >
      {CASE_STATUSES.map((o) => <option key={o} value={o}>{CASE_STATUS_LABELS[o]}</option>)}
    </NativeSelect>
  );
  return (
    <div className="group/fill relative" data-fill-group="suites" data-fill-id={suiteId}>
      {select}
      {caseCount > 0 && <FillHandle group="suites" id={suiteId} onFill={fill} />}
    </div>
  );
}
