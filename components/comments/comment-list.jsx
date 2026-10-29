"use client";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CommentBody } from "./comment-body";
import { Avatar } from "./avatar";
import { CommentForm } from "./comment-form";
import { MentionTextarea } from "./mention-textarea";
import { decodeMentions, encodeMentions } from "@/lib/mentions";
import { ListMenu, useListEditing } from "./list-menu";
import { toggleCheck } from "./list-tools";

function EditBox({ initial, pending, members, onSave, onCancel }) {
  const decoded = useMemo(() => decodeMentions(initial), [initial]);
  const [text, setText] = useState(decoded.text);
  const [picked, setPicked] = useState(decoded.mentions);
  const save = () => onSave(encodeMentions(text, picked));
  const ref = useRef(null);
  const lists = useListEditing(ref, text, setText);
  return (
    <div className="space-y-2">
      <MentionTextarea
        areaRef={ref}
        members={members}
        onPick={(m) => setPicked((p) => [...p.filter((x) => x.id !== m.id), m])}
        aria-label="Edit comment"
        autoFocus
        rows={2}
        value={text}
        onChange={setText}
        onKeyDown={(e) => {
          if (lists.onKeyDown(e)) return;
          if (e.key === "Escape") onCancel();
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim()) save();
        }}
        className="field-sizing-content block min-h-16 w-full resize-none rounded-lg border bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={pending || !text.trim() || text.trim() === decoded.text.trim()} onClick={save}>Save</Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
        <span className="ml-auto"><ListMenu onPick={lists.apply} /></span>
      </div>
    </div>
  );
}

function Item({ c, canEdit, onEdit, onDelete, onToggle }) {
  return (
    <div className="space-y-2 border-b px-4 py-3 text-sm" data-testid="comment">
      <div className="flex items-center gap-3">
        <Avatar name={c.authorName} />
        <span className="font-medium">{c.authorName}</span>
        <span className="text-muted-foreground" title={c.title}>{c.at}</span>
        {c.edited && <span className="text-xs text-muted-foreground">(edited)</span>}
        {canEdit && c.mine && (
          <DropdownMenu>
            <DropdownMenuTrigger aria-label="Comment actions" className="ml-auto rounded-md p-1 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuItem onClick={onEdit}><Pencil /> Edit</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={onDelete}><Trash2 /> Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="pl-10">{c.editor ?? <CommentBody body={c.body} onToggle={canEdit && c.mine ? (nth) => onToggle(toggleCheck(c.body, nth)) : undefined} />}</div>
    </div>
  );
}

/**
 * Linear-style threads. Each thread is a card (comment, its replies, a reply bar); a separate box below starts a new thread.
 * The "…" menu (edit/delete) appears only on the viewer's own comments; the server enforces it too.
 */
export function CommentList({ projectId, targetId, threads, canEdit, userName, onAdd, onUpdate, onDelete, members = [] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null); // { id, replies }
  // Ticked checklist items show at once. An override only applies while the server body is still the one it was made from,
  // so it drops out by itself when refreshed data arrives or when the save fails.
  const [over, setOver] = useState({});
  const queue = useRef(Promise.resolve());

  const save = (id, body) =>
    start(async () => {
      const res = await onUpdate(projectId, targetId, id, { body });
      if (!res.ok) return toast.error(res.fieldErrors?.body ?? res.error);
      setEditing(null);
      router.refresh();
    });
  const remove = (id) =>
    start(async () => {
      const res = await onDelete(projectId, targetId, id);
      if (!res.ok) return toast.error(res.error);
      toast.success("Comment deleted");
      router.refresh();
    });

  const toggle = (c, body) => {
    setOver((o) => ({ ...o, [c.id]: { base: o[c.id]?.base ?? c.body, body } }));
    queue.current = queue.current.then(async () => {
      const res = await onUpdate(projectId, targetId, c.id, { body });
      if (!res.ok) {
        setOver((o) => { const { [c.id]: _, ...rest } = o; return rest; });
        return toast.error(res.fieldErrors?.body ?? res.error);
      }
      router.refresh();
    });
  };

  const item = (row, replies = 0) => {
    const o = over[row.id];
    const c = o && o.base === row.body ? { ...row, body: o.body } : row;
    return (
    <Item
      key={c.id}
      c={editing === c.id ? { ...c, editor: <EditBox initial={c.body} members={members} pending={pending} onSave={(b) => save(c.id, b)} onCancel={() => setEditing(null)} /> } : c}
      canEdit={canEdit}
      onEdit={() => setEditing(c.id)}
      onDelete={() => setDeleting({ id: c.id, replies })}
      onToggle={(body) => toggle(row, body)}
    />
    );
  };

  return (
    <div className="space-y-4">
      {threads.map((t) => (
        <div key={t.id} className="overflow-hidden rounded-xl border bg-card" data-testid="comment-thread">
          {item(t, t.replies.length)}
          {t.replies.map((r) => item(r))}
          {canEdit && <CommentForm projectId={projectId} targetId={targetId} userName={userName} onAdd={onAdd} parentId={t.id} members={members} />}
        </div>
      ))}
      {canEdit && <CommentForm box projectId={projectId} targetId={targetId} userName={userName} onAdd={onAdd} members={members} />}
      <ConfirmDialog
        open={deleting != null}
        onOpenChange={(o) => { if (!o) setDeleting(null); }}
        title="Delete this comment?"
        description={deleting?.replies ? "Its replies will be deleted too. This cannot be undone." : "This cannot be undone."}
        confirmLabel="Delete"
        onConfirm={() => remove(deleting.id)}
      />
    </div>
  );
}
