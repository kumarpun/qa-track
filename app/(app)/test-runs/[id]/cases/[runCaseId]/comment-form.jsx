"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addCommentAction } from "@/app/actions/executions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function CommentForm({ projectId, runCaseId }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [body, setBody] = useState("");
  const submit = (e) => {
    e.preventDefault();
    start(async () => {
      const res = await addCommentAction(projectId, runCaseId, { body });
      if (!res.ok) return toast.error(res.fieldErrors?.body ?? res.error);
      setBody("");
      router.refresh();
    });
  };
  return (
    <form onSubmit={submit} className="space-y-2">
      <Textarea aria-label="Add a comment" rows={2} placeholder="Add a comment…" value={body} onChange={(e) => setBody(e.target.value)} />
      <Button type="submit" size="sm" disabled={pending || !body.trim()}>Post comment</Button>
    </form>
  );
}
