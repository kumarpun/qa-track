"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUp, Paperclip } from "lucide-react";
import { uploadCommentImageAction } from "@/app/actions/executions";
import { encodeMentions } from "@/lib/mentions";
import { Avatar } from "./avatar";
import { MentionTextarea } from "./mention-textarea";
import { ListMenu, useListEditing } from "./list-menu";

/** Linear-style input. Default is a one-line reply bar (avatar + input + buttons); `box` is the standalone "Leave a comment…" card. Cmd/Ctrl+Enter sends. */
export function CommentForm({ projectId, targetId, userName, onAdd, parentId, box = false, members = [] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [body, setBody] = useState("");
  const [picked, setPicked] = useState([]);
  const fileRef = useRef(null);
  const areaRef = useRef(null);
  const lists = useListEditing(areaRef, body, setBody);
  const [uploading, setUploading] = useState(false);
  const upload = async (file) => {
    setUploading(true);
    const fd = new FormData();
    fd.set("file", file);
    const res = await uploadCommentImageAction(projectId, fd).catch(() => ({ ok: false, error: "Image upload failed" }));
    setUploading(false);
    if (!res.ok) return toast.error(res.error);
    setBody((b) => `${b}${b && !b.endsWith("\n") ? "\n" : ""}![image](${res.data.url})\n`);
  };
  const onPaste = (e) => {
    const file = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
    if (file) { e.preventDefault(); upload(file); }
  };
  const canSend = !pending && !uploading && body.trim().length > 0;
  const submit = (e) => {
    e?.preventDefault();
    if (!canSend) return;
    const text = encodeMentions(body, picked);
    start(async () => {
      const res = await onAdd(projectId, targetId, parentId ? { body: text, parentId } : { body: text });
      if (!res.ok) return toast.error(res.fieldErrors?.body ?? res.error);
      setBody("");
      setPicked([]);
      router.refresh();
    });
  };
  const input = (
    <MentionTextarea
      areaRef={areaRef}
      members={members}
      onPick={(m) => setPicked((p) => [...p.filter((x) => x.id !== m.id), m])}
      aria-label={box ? "Add a comment" : "Add a reply"}
      rows={1}
      placeholder={uploading ? "Uploading image…" : box ? "Leave a comment…" : "Leave a reply…"}
      value={body}
      onChange={setBody}
      onPaste={onPaste}
      onKeyDown={(e) => { if (lists.onKeyDown(e)) return; if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(e); }}
      className="field-sizing-content block max-h-60 min-h-7 w-full resize-none bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
    />
  );
  const buttons = (
    <>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only" aria-label="Attach image" tabIndex={-1}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
      <ListMenu onPick={lists.apply} />
      <button type="button" aria-label="Add image" disabled={uploading} onClick={() => fileRef.current?.click()}
        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50">
        <Paperclip className="size-4" />
      </button>
      <button type="submit" aria-label={box ? "Post comment" : "Post reply"} disabled={!canSend}
        className="inline-flex size-8 items-center justify-center rounded-full bg-muted text-foreground hover:bg-muted/70 disabled:opacity-40">
        <ArrowUp className="size-4" />
      </button>
    </>
  );
  if (box) {
    return (
      <form onSubmit={submit} className="rounded-xl border bg-card px-4 py-2">
        {input}
        <div className="flex items-center justify-end gap-3">{buttons}</div>
      </form>
    );
  }
  return (
    <form onSubmit={submit} className="flex items-center gap-3 px-4 py-3">
      <Avatar name={userName} />
      {input}
      {buttons}
    </form>
  );
}
