"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteDefectAction, setDefectStatusAction } from "@/app/actions/defects";
import { DEFECT_STATUSES } from "@/lib/validation/defect";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/native-select";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { label } from "../../test-cases/labels";

export function DefectActions({ projectId, defectId, status, canWrite, canDelete }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);

  const changeStatus = (value) =>
    start(async () => {
      const res = await setDefectStatusAction(projectId, defectId, value);
      if (!res.ok) return toast.error(res.error);
      toast.success(`Status set to ${label(value)}`);
      router.refresh();
    });
  const remove = () =>
    start(async () => {
      const res = await deleteDefectAction(projectId, defectId);
      if (!res.ok) return toast.error(res.error);
      toast.success("Defect deleted");
      router.push("/defects");
      router.refresh();
    });

  return (
    <>
      {canWrite && (
        <NativeSelect aria-label="Change status" className="w-auto min-w-32" disabled={pending} value={status} onChange={(e) => changeStatus(e.target.value)}>
          {DEFECT_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </NativeSelect>
      )}
      {canDelete && <Button variant="outline" size="sm" disabled={pending} onClick={() => setConfirm(true)}><Trash2 /> Delete</Button>}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Delete this defect?"
        description="This cannot be undone. Defects linked to test executions cannot be deleted; close them instead."
        confirmLabel="Delete"
        onConfirm={remove}
      />
    </>
  );
}
