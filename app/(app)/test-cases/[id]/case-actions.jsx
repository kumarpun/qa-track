"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteCaseAction, duplicateCaseAction } from "@/app/actions/testcases";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function CaseActions({ projectId, caseId }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);

  const remove = () =>
    start(async () => {
      const res = await deleteCaseAction(projectId, caseId);
      if (!res.ok) return toast.error(res.error);
      toast.success("Test case deleted");
      router.push("/test-cases");
    });
  const duplicate = () =>
    start(async () => {
      const res = await duplicateCaseAction(projectId, caseId);
      if (!res.ok) return toast.error(res.error);
      toast.success(`Created ${res.data.code}`);
      router.push(`/test-cases/${res.data.id}`);
    });

  return (
    <>
      <Button variant="outline" size="sm" disabled={pending} onClick={duplicate}><Copy /> Duplicate</Button>
      <Button variant="outline" size="icon-sm" aria-label="Delete test case" title="Delete test case" disabled={pending} onClick={() => setConfirm(true)}>
        <Trash2 className="text-destructive" />
      </Button>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Delete this test case permanently?"
        description="This cannot be undone. The test case, its steps and suite membership are removed from the database. A case that is part of a test run cannot be deleted."
        confirmLabel="Delete"
        onConfirm={remove}
      />
    </>
  );
}
