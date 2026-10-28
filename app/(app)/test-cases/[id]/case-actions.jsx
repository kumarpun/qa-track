"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Copy } from "lucide-react";
import { toast } from "sonner";
import { archiveCaseAction, duplicateCaseAction } from "@/app/actions/testcases";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function CaseActions({ projectId, caseId, archived }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);

  const setArchived = (value) =>
    start(async () => {
      const res = await archiveCaseAction(projectId, caseId, value);
      if (!res.ok) return toast.error(res.error);
      toast.success(value ? "Test case archived" : "Test case restored");
      router.refresh();
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
      {archived
        ? <Button variant="outline" size="sm" disabled={pending} onClick={() => setArchived(false)}><ArchiveRestore /> Restore</Button>
        : <Button variant="outline" size="sm" disabled={pending} onClick={() => setConfirm(true)}><Archive /> Archive</Button>}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Archive this test case?"
        description="It will be hidden from the default list and cannot be edited until restored. Existing test runs keep their snapshot."
        confirmLabel="Archive"
        onConfirm={() => setArchived(true)}
      />
    </>
  );
}
