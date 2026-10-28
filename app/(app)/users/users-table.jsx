"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { ROLES, ROLE_LABELS } from "@/lib/permissions";
import { userCreateSchema } from "@/lib/validation/user";
import { createUserAction, updateUserAction } from "@/app/actions/users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/form-field";
import { NativeSelect } from "@/components/native-select";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmDialog } from "@/components/confirm-dialog";

function CreateUser() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm({
    resolver: zodResolver(userCreateSchema),
    defaultValues: { name: "", email: "", password: "", role: "QA_ENGINEER" },
  });
  const onSubmit = (v) =>
    start(async () => {
      const res = await createUserAction(v);
      if (!res.ok) {
        for (const [k, m] of Object.entries(res.fieldErrors ?? {})) setError(k, { message: m });
        return toast.error(res.error);
      }
      toast.success("User created");
      reset();
      setOpen(false);
      router.refresh();
    });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}><Plus /> New user</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New user</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Field label="Name" htmlFor="u-name" error={errors.name?.message}><Input id="u-name" {...register("name")} /></Field>
          <Field label="Email" htmlFor="u-email" error={errors.email?.message}><Input id="u-email" type="email" {...register("email")} /></Field>
          <Field label="Temporary password" htmlFor="u-pw" error={errors.password?.message} hint="At least 8 characters with a letter and a number.">
            <Input id="u-pw" type="password" autoComplete="new-password" {...register("password")} />
          </Field>
          <Field label="Role" htmlFor="u-role">
            <NativeSelect id="u-role" {...register("role")}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</NativeSelect>
          </Field>
          <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create user"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function UsersTable({ users, meId }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toggle, setToggle] = useState(null);

  const update = (u, patch) =>
    start(async () => {
      const res = await updateUserAction(u.id, { name: u.name, role: u.role, active: u.active, ...patch });
      if (!res.ok) return toast.error(res.error);
      toast.success("User updated");
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><CreateUser /></div>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.name}{u.id === meId && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>
                  <NativeSelect aria-label={`Role for ${u.name}`} className="w-36" value={u.role} disabled={pending || u.id === meId} onChange={(e) => update(u, { role: e.target.value })}>
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </NativeSelect>
                </TableCell>
                <TableCell><StatusBadge status={u.active ? "ACTIVE" : "ARCHIVED"} label={u.active ? "Active" : "Deactivated"} /></TableCell>
                <TableCell className="text-right">
                  {u.id !== meId && (
                    <Button variant="outline" size="sm" disabled={pending} onClick={() => (u.active ? setToggle(u) : update(u, { active: true }))}>
                      {u.active ? "Deactivate" : "Reactivate"}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ConfirmDialog
        open={!!toggle}
        onOpenChange={(o) => !o && setToggle(null)}
        title="Deactivate user?"
        description={toggle ? `${toggle.name} will be signed out and unable to log in. History is preserved.` : ""}
        confirmLabel="Deactivate"
        onConfirm={() => { update(toggle, { active: false }); setToggle(null); }}
      />
    </div>
  );
}
