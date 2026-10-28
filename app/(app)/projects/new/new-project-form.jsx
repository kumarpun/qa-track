"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { projectSchema } from "@/lib/validation/project";
import { createProjectAction } from "@/app/actions/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Field } from "@/components/form-field";

export function NewProjectForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { register, handleSubmit, setError, formState: { errors } } = useForm({
    resolver: zodResolver(projectSchema),
    defaultValues: { name: "", key: "", description: "" },
  });
  const onSubmit = (values) =>
    start(async () => {
      const res = await createProjectAction(values);
      if (!res.ok) {
        for (const [k, m] of Object.entries(res.fieldErrors ?? {})) setError(k, { message: m });
        return toast.error(res.error);
      }
      toast.success("Project created");
      router.push(`/projects/${res.data.id}`);
      router.refresh();
    });
  return (
    <Card className="max-w-xl">
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Field label="Name" htmlFor="name" error={errors.name?.message}><Input id="name" {...register("name")} /></Field>
          <Field label="Key" htmlFor="key" error={errors.key?.message} hint="Used in codes, e.g. APP → TC-APP-0001. Cannot be changed later.">
            <Input id="key" className="uppercase" maxLength={10} {...register("key")} />
          </Field>
          <Field label="Description" htmlFor="description" error={errors.description?.message}>
            <Textarea id="description" rows={3} {...register("description")} />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create project"}</Button>
            <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
