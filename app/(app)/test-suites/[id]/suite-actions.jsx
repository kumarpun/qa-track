"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { archiveSuiteAction, deleteSuiteAction, duplicateSuiteAction } from "@/app/actions/suites";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function SuiteActions({ projectId, suiteId, archived, caseCount = 0, canDelete = false }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const setArchived = (value) =>
    start(async () => {
      const res = await archiveSuiteAction(projectId, suiteId, value);
      if (!res.ok) return toast.error(res.error);
      toast.success(value ? "Suite archived" : "Suite restored");
      router.refresh();
    });
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
      {archived
        ? <Button variant="outline" size="sm" disabled={pending} onClick={() => setArchived(false)}><ArchiveRestore /> Restore</Button>
        : <Button variant="outline" size="sm" disabled={pending} onClick={() => setConfirm(true)}><Archive /> Archive</Button>}
      {canDelete && <Button variant="outline" size="sm" disabled={pending} onClick={() => setConfirmDelete(true)}><Trash2 /> Delete</Button>}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this suite and its test cases?"
        description={caseCount
          ? `This permanently deletes the suite and its ${caseCount} test case${caseCount > 1 ? "s" : ""}, including their steps and comments. The cases are also removed from any other suite. This cannot be undone. Deletion is refused if any of these cases are part of a test run.`
          : "This permanently deletes the suite. It has no test cases. This cannot be undone."}
        confirmLabel="Delete suite and cases"
        onConfirm={remove}
      />
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Archive this suite?"
        description="It will be hidden from the suite tree and cannot be used in new runs. Existing runs are not affected."
        confirmLabel="Archive"
        onConfirm={() => setArchived(true)}
      />
    </>
  );
}
