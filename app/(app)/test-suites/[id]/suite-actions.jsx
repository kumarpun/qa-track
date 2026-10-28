"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Copy } from "lucide-react";
import { toast } from "sonner";
import { archiveSuiteAction, duplicateSuiteAction } from "@/app/actions/suites";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function SuiteActions({ projectId, suiteId, archived }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);

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

  return (
    <>
      <Button variant="outline" size="sm" disabled={pending} onClick={duplicate}><Copy /> Duplicate</Button>
      {archived
        ? <Button variant="outline" size="sm" disabled={pending} onClick={() => setArchived(false)}><ArchiveRestore /> Restore</Button>
        : <Button variant="outline" size="sm" disabled={pending} onClick={() => setConfirm(true)}><Archive /> Archive</Button>}
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
