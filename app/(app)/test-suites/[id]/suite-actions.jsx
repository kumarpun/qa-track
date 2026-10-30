"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteSuiteAction, duplicateSuiteAction } from "@/app/actions/suites";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function SuiteActions({ projectId, suiteId, caseCount = 0, canDelete = false }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const duplicate = () =>
    start(async () => {
      const res = await duplicateSuiteAction(projectId, suiteId);
      if (!res.ok) return toast.error(res.error);
      toast.success("Suite duplicated");
      router.push(`/test-suites/${res.data.id}`);
    });

  const remove = () =>
    start(async () => {
      const res = await deleteSuiteAction(projectId, suiteId);
      if (!res.ok) return toast.error(res.error);
      toast.success(res.data.deletedCases ? `Suite and ${res.data.deletedCases} test case${res.data.deletedCases > 1 ? "s" : ""} deleted` : "Suite deleted");
      router.push("/test-suites");
      router.refresh();
    });

  return (
    <>
      <Button variant="outline" size="sm" disabled={pending} onClick={duplicate}><Copy /> Duplicate</Button>
      {canDelete && <Button variant="outline" size="sm" disabled={pending} onClick={() => setConfirmDelete(true)}><Trash2 /> Delete</Button>}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this suite and its test cases?"
        description={caseCount
          ? `This permanently deletes the suite and its ${caseCount} test case${caseCount > 1 ? "s" : ""}, including their steps and comments. The cases are also removed from any other suite. This cannot be undone. Runs created from this suite stay, but deletion is refused if any of its cases are in a test run that is not completed.`
          : "This permanently deletes the suite. It has no test cases. This cannot be undone."}
        confirmLabel="Delete suite and cases"
        onConfirm={remove}
      />
    </>
  );
}
