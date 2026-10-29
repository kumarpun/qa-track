"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteCaseHistoryAction } from "@/app/actions/testcases";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LocalTime } from "@/components/local-time";
import { StatusBadge } from "@/components/status-badge";
import { CASE_STATUS_LABELS } from "../labels";

/** Collapsible (closed by default) result history with bulk delete. Only manual / browser-run entries can be removed; results recorded in a test run are kept. */
export function ResultHistory({ projectId, caseId, authorName, createdAt, rows, canDelete }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [marked, setMarked] = useState(() => new Set());
  const [confirm, setConfirm] = useState(false);
  const [open, setOpen] = useState(false);

  const deletable = canDelete ? rows.filter((r) => !r.runId) : [];
  const allMarked = deletable.length > 0 && deletable.every((r) => marked.has(r.id));
  const toggle = (id) => setMarked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const remove = () =>
    start(async () => {
      const res = await deleteCaseHistoryAction(projectId, caseId, [...marked]);
      if (!res.ok) return toast.error(res.error);
      toast.success(`Deleted ${res.data.deleted} history entr${res.data.deleted === 1 ? "y" : "ies"}`);
      setMarked(new Set());
      router.refresh();
    });

  return (
    <section className="space-y-1.5">
      <h2 className="text-sm font-semibold">
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="-ml-1 flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted">
          <ChevronRight className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
          Result history <span className="font-normal text-muted-foreground">({rows.length})</span>
        </button>
      </h2>
      {open && deletable.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" aria-label="Select all history entries" checked={allMarked} onChange={() => setMarked(allMarked ? new Set() : new Set(deletable.map((r) => r.id)))} />
            {marked.size ? `${marked.size} selected` : "Select all"}
          </label>
          {marked.size > 0 && (
            <>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => setConfirm(true)}><Trash2 className="text-destructive" /> Delete selected</Button>
              <Button size="sm" variant="ghost" onClick={() => setMarked(new Set())}>Clear</Button>
            </>
          )}
        </div>
      )}
      {open && <ul className="divide-y" data-testid="result-history">
        <li className="py-2.5 text-sm text-muted-foreground">Created by {authorName} <span className="ml-3"><LocalTime value={createdAt} /></span></li>
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
            {deletable.length > 0 && (
              r.runId
                ? <span className="w-[13px]" />
                : <input type="checkbox" aria-label="Select history entry" checked={marked.has(r.id)} onChange={() => toggle(r.id)} />
            )}
            <StatusBadge status={r.status} label={CASE_STATUS_LABELS[r.status]} />
            {r.runId
              ? <Link className="hover:underline" href={`/test-runs/${r.runId}/cases/${r.runCaseId}`}>{r.runCode} · {r.runName}</Link>
              : <span className="text-muted-foreground">{r.autoRun ? "Browser run" : "Status set manually"}</span>}
            <span className="ml-auto text-muted-foreground">{r.by} · <LocalTime value={r.at} /></span>
          </li>
        ))}
      </ul>}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Delete ${marked.size} history entr${marked.size === 1 ? "y" : "ies"}?`}
        description="This cannot be undone. The test case's current result is not changed, and results recorded in test runs are kept."
        confirmLabel="Delete"
        onConfirm={remove}
      />
    </section>
  );
}
