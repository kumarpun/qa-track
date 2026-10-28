"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function AttachmentDelete({ id, name }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const remove = async () => {
    const res = await fetch(`/api/attachments/${id}`, { method: "DELETE" });
    if (!res.ok) return toast.error((await res.json().catch(() => ({}))).error ?? "Could not remove file");
    toast.success("Attachment removed");
    router.refresh();
  };
  return (
    <>
      <button type="button" aria-label={`Remove ${name}`} className="text-muted-foreground hover:text-destructive" onClick={() => setOpen(true)}><X className="size-3" /></button>
      <ConfirmDialog open={open} onOpenChange={setOpen} title="Remove attachment?" description={`${name} will be permanently deleted.`} confirmLabel="Remove" onConfirm={remove} />
    </>
  );
}
