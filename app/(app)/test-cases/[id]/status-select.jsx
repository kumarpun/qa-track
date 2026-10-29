"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CASE_STATUSES } from "@/lib/validation/testcase";
import { fillCaseStatusAction, setCaseStatusAction } from "@/app/actions/testcases";
import { NativeSelect } from "@/components/native-select";
import { FillHandle } from "@/components/fill-handle";
import { cn } from "@/lib/utils";
import { CASE_STATUS_LABELS } from "../labels";

export const FILL = {
  PASSED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  FAILED: "bg-red-500/15 text-red-700 dark:text-red-400",
  BLOCKED: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  IN_PROGRESS: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  SKIPPED: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
};

/** Change the case status in place so a tester can mark progress while writing or running the steps. `filled` renders a spreadsheet-style coloured cell. */
export function StatusSelect({ projectId, caseId, status, filled = false, ariaLabel = "Status", fillGroup }) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [pending, start] = useTransition();
  const [seen, setSeen] = useState(status);
  if (seen !== status) { setSeen(status); setValue(status); } // server value changed (e.g. after a fill)

  const change = (next) => {
    const prev = value;
    setValue(next);
    start(async () => {
      const res = await setCaseStatusAction(projectId, caseId, next);
      if (!res.ok) {
        setValue(prev);
        return toast.error(res.error);
      }
      router.refresh();
    });
  };

  const fill = (ids) =>
    start(async () => {
      const res = await fillCaseStatusAction(projectId, [caseId, ...ids], value);
      if (!res.ok) return toast.error(res.error);
      toast.success(`Set ${res.data.affected} test case(s) to ${CASE_STATUS_LABELS[value]}`);
      router.refresh();
    });

  const select = (
    <NativeSelect
      aria-label={ariaLabel}
      value={value}
      disabled={pending}
      onChange={(e) => change(e.target.value)}
      className={cn("border-transparent bg-transparent px-2.5 hover:border-input dark:bg-transparent", filled && "w-full rounded-none border-0 font-medium", filled && FILL[value])}
    >
      {CASE_STATUSES.map((o) => <option key={o} value={o}>{CASE_STATUS_LABELS[o]}</option>)}
    </NativeSelect>
  );
  if (!fillGroup) return select;
  return (
    <div className="group/fill relative" data-fill-group={fillGroup} data-fill-id={caseId}>
      {select}
      <FillHandle group={fillGroup} id={caseId} onFill={fill} />
    </div>
  );
}
