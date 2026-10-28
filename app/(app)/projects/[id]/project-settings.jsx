"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { projectUpdateSchema } from "@/lib/validation/project";
import { updateProjectAction } from "@/app/actions/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/form-field";
import { NativeSelect } from "@/components/native-select";

export function ProjectSettings({ project, canManage, owners }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { register, handleSubmit, setError, formState: { errors, isDirty } } = useForm({
    resolver: zodResolver(projectUpdateSchema),
    defaultValues: { name: project.name, description: project.description, status: project.status, ownerId: project.ownerId },
  });
  const onSubmit = (values) =>
    start(async () => {
      const res = await updateProjectAction(project.id, values);
      if (!res.ok) {
        for (const [k, m] of Object.entries(res.fieldErrors ?? {})) setError(k, { message: m });
        return toast.error(res.error);
      }
      toast.success("Project updated");
      router.refresh();
    });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Settings</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <fieldset disabled={!canManage || pending} className="space-y-4">
            <Field label="Name" htmlFor="name" error={errors.name?.message}><Input id="name" {...register("name")} /></Field>
            <Field label="Description" htmlFor="description" error={errors.description?.message}>
              <Textarea id="description" rows={3} {...register("description")} />
            </Field>
            <Field label="Status" htmlFor="status" hint="Archived projects are read-only.">
              <NativeSelect id="status" {...register("status")}>
                <option value="ACTIVE">Active</option>
                <option value="ARCHIVED">Archived</option>
              </NativeSelect>
            </Field>
            {canManage && (
              <Field label="Owner" htmlFor="ownerId" error={errors.ownerId?.message}>
                <NativeSelect id="ownerId" {...register("ownerId")}>
                  {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </NativeSelect>
              </Field>
            )}
          </fieldset>
          {canManage && <Button type="submit" disabled={pending || !isDirty}>{pending ? "Saving…" : "Save changes"}</Button>}
        </form>
      </CardContent>
    </Card>
  );
}
