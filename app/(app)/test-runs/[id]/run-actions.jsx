"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, RotateCcw, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { deleteRunAction, setRunStatusAction } from "@/app/actions/runs";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";

const COPY = {
  COMPLETED: { title: "Complete this run?", description: "No further results can be recorded until the run is reopened.", confirm: "Complete run", done: "Run completed" },
  CANCELLED: { title: "Cancel this run?", description: "The run is closed and results can no longer be recorded. You can reopen it later.", confirm: "Cancel run", done: "Run cancelled" },
};

export function RunActions({ projectId, runId, status }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(null);
  const open = status === "DRAFT" || status === "IN_PROGRESS";

  const change = (next, message) =>
    start(async () => {
      const res = await setRunStatusAction(projectId, runId, next);
      if (!res.ok) return toast.error(res.error);
      toast.success(message);
      router.refresh();
    });

  const remove = () =>
    start(async () => {
      const res = await deleteRunAction(projectId, runId);
      if (!res.ok) return toast.error(res.error);
      toast.success("Run deleted");
      router.push("/test-runs");
      router.refresh();
    });

  return (
    <>
      {open ? (
        <>
          <Button size="sm" disabled={pending} onClick={() => setConfirm("COMPLETED")}><CheckCheck /> Complete run</Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => setConfirm("CANCELLED")}><XCircle /> Cancel run</Button>
        </>
      ) : (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => change("IN_PROGRESS", "Run reopened")}><RotateCcw /> Reopen run</Button>
      )}
      <Button size="sm" variant="outline" disabled={pending} onClick={() => setConfirm("DELETE")}><Trash2 /> Delete</Button>
      {confirm === "DELETE" && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setConfirm(null)}
          title="Delete this run permanently?"
          description="All its results, step results, comments and attachments are removed, and they disappear from case Result history, reports and the dashboard trend. Defects raised from it are kept. This cannot be undone."
          confirmLabel="Delete run"
          onConfirm={() => { setConfirm(null); remove(); }}
        />
      )}
      {confirm && confirm !== "DELETE" && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setConfirm(null)}
          title={COPY[confirm].title}
          description={COPY[confirm].description}
          confirmLabel={COPY[confirm].confirm}
          onConfirm={() => { const next = confirm; setConfirm(null); change(next, COPY[next].done); }}
        />
      )}
    </>
  );
}
