"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserMinus } from "lucide-react";
import { ROLE_LABELS } from "@/lib/permissions";
import { removeMemberAction, setMemberAction } from "@/app/actions/projects";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/native-select";
import { ConfirmDialog } from "@/components/confirm-dialog";

const PROJECT_ROLES = ["QA_LEAD", "QA_ENGINEER", "VIEWER"];

export function Members({ projectId, members, users, canManage }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toRemove, setToRemove] = useState(null);
  const [newUser, setNewUser] = useState("");
  const [newRole, setNewRole] = useState("QA_ENGINEER");

  const save = (userId, role) =>
    start(async () => {
      const res = await setMemberAction(projectId, { userId, role });
      if (!res.ok) return toast.error(res.error);
      toast.success("Member saved");
      setNewUser("");
      router.refresh();
    });

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Members ({members.length})</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <ul className="divide-y">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{m.name}{m.isOwner && <span className="ml-2 text-xs text-muted-foreground">(owner)</span>}</p>
                <p className="truncate text-xs text-muted-foreground">{m.email}</p>
              </div>
              {canManage && !m.isOwner ? (
                <div className="flex items-center gap-2">
                  <NativeSelect aria-label={`Role for ${m.name}`} className="w-36" value={m.role} disabled={pending} onChange={(e) => save(m.userId, e.target.value)}>
                    {PROJECT_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </NativeSelect>
                  <Button variant="ghost" size="icon" aria-label={`Remove ${m.name}`} onClick={() => setToRemove(m)}><UserMinus /></Button>
                </div>
              ) : <span className="text-sm text-muted-foreground">{ROLE_LABELS[m.role]}</span>}
            </li>
          ))}
        </ul>

        {canManage && (
          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <NativeSelect aria-label="User to add" className="min-w-0 flex-1" value={newUser} onChange={(e) => setNewUser(e.target.value)}>
              <option value="">Add a member…</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
            </NativeSelect>
            <NativeSelect aria-label="Role for new member" className="w-36" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
              {PROJECT_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </NativeSelect>
            <Button disabled={!newUser || pending} onClick={() => save(newUser, newRole)}>Add</Button>
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={!!toRemove}
        onOpenChange={(o) => !o && setToRemove(null)}
        title="Remove member?"
        description={toRemove ? `${toRemove.name} will lose access to this project. Their past activity is kept.` : ""}
        confirmLabel="Remove"
        onConfirm={async () => {
          const res = await removeMemberAction(projectId, toRemove.userId);
          if (!res.ok) return toast.error(res.error);
          toast.success("Member removed");
          setToRemove(null);
          router.refresh();
        }}
      />
    </Card>
  );
}
