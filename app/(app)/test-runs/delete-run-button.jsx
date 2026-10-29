"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteRunAction } from "@/app/actions/runs";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function DeleteRunButton({ projectId, runId, code }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

  const remove = () =>
    start(async () => {
      const res = await deleteRunAction(projectId, runId);
      if (!res.ok) return toast.error(res.error);
      toast.success(`${code} deleted`);
      router.refresh();
    });

  return (
    <>
      <Button variant="ghost" size="icon-sm" aria-label={`Delete ${code}`} disabled={pending} onClick={() => setOpen(true)}><Trash2 /></Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete ${code} permanently?`}
        description="All its results, step results, comments and attachments are removed, and they disappear from case Result history, reports and the dashboard. Defects raised from it are kept. This cannot be undone."
        confirmLabel="Delete run"
        onConfirm={remove}
      />
    </>
  );
}
