"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { recordExecutionAction } from "@/app/actions/executions";
import { StatusBadge } from "@/components/status-badge";
import { NativeSelect } from "@/components/native-select";
import { STATUS_LABELS } from "@/lib/metrics";

const RESULTS = ["PASSED", "FAILED", "BLOCKED", "SKIPPED", "RETEST"];

/** Changing the status records a result straight away; "Not Run" is only the initial state and cannot be chosen again. */
export function ResultStatusSelect({ projectId, runCaseId, current, editable }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!editable) return <StatusBadge status={current} />;
  const change = (status) =>
    start(async () => {
      const res = await recordExecutionAction(projectId, runCaseId, { status, actualResult: "", comment: "", steps: [], defectIds: [] });
      if (!res.ok) return toast.error(res.error);
      toast.success(`Recorded ${STATUS_LABELS[status]}`);
      router.refresh();
    });
  return (
    <NativeSelect
      aria-label="Status"
      value={current}
      disabled={pending}
      onChange={(e) => change(e.target.value)}
      className="border-transparent bg-transparent px-2.5 hover:border-input dark:bg-transparent"
    >
      {current === "NOT_RUN" && <option value="NOT_RUN" disabled>{STATUS_LABELS.NOT_RUN}</option>}
      {RESULTS.map((o) => <option key={o} value={o}>{STATUS_LABELS[o]}</option>)}
    </NativeSelect>
  );
}
