"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { DEFECT_ENVIRONMENTS, DEFECT_PRIORITIES, SEVERITIES } from "@/lib/validation/defect";
import { createDefectFullAction, updateDefectAction } from "@/app/actions/defects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Field } from "@/components/form-field";
import { NativeSelect } from "@/components/native-select";
import { label } from "../test-cases/labels";

export function DefectForm({ projectId, assignees, initial, defectId }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const editing = Boolean(defectId);
  const { register, handleSubmit, setError, formState: { errors } } = useForm({
    defaultValues: {
      title: initial?.title ?? "",
      description: initial?.description ?? "",
      stepsToReproduce: initial?.stepsToReproduce ?? "",
      expectedResult: initial?.expectedResult ?? "",
      actualResult: initial?.actualResult ?? "",
      severity: initial?.severity ?? "MAJOR",
      priority: initial?.priority ?? "MEDIUM",
      environment: initial?.environment ?? "",
      buildVersion: initial?.buildVersion ?? "",
      externalUrl: initial?.externalUrl ?? "",
      assigneeId: initial?.assigneeId ?? "",
    },
  });

  const onSubmit = (input) =>
    start(async () => {
      const res = editing ? await updateDefectAction(projectId, defectId, input) : await createDefectFullAction(projectId, input);
      if (!res.ok) {
        for (const [k, m] of Object.entries(res.fieldErrors ?? {})) setError(k, { message: m });
        return toast.error(res.error);
      }
      toast.success(editing ? "Defect saved" : "Defect created");
      router.push(`/defects/${editing ? defectId : res.data.id}`);
      router.refresh();
    });

  const text = (name, lbl, rows = 3) => (
    <Field label={lbl} htmlFor={name} error={errors[name]?.message}>
      <Textarea id={name} rows={rows} {...register(name)} />
    </Field>
  );
  const select = (name, lbl, list, blank) => (
    <Field label={lbl} htmlFor={name} error={errors[name]?.message}>
      <NativeSelect id={name} {...register(name)}>
        {blank && <option value="">{blank}</option>}
        {list.map((v) => <option key={v} value={v}>{label(v)}</option>)}
      </NativeSelect>
    </Field>
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl" noValidate>
      <Card>
        <CardContent className="space-y-4 pt-6">
          <Field label="Title" htmlFor="title" error={errors.title?.message}>
            <Input id="title" {...register("title", { required: "Title is required" })} />
          </Field>
          {text("description", "Description")}
          {text("stepsToReproduce", "Steps to reproduce")}
          <div className="grid gap-4 sm:grid-cols-2">
            {text("expectedResult", "Expected result", 2)}
            {text("actualResult", "Actual result", 2)}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {select("severity", "Severity", SEVERITIES)}
            {select("priority", "Priority", DEFECT_PRIORITIES)}
            {select("environment", "Environment", DEFECT_ENVIRONMENTS, "Not set")}
            <Field label="Build version" htmlFor="buildVersion" error={errors.buildVersion?.message}>
              <Input id="buildVersion" {...register("buildVersion")} />
            </Field>
          </div>
          <Field label="Assignee" htmlFor="assigneeId" error={errors.assigneeId?.message}>
            <NativeSelect id="assigneeId" {...register("assigneeId")}>
              <option value="">Unassigned</option>
              {assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </NativeSelect>
          </Field>
          <Field label="External URL" htmlFor="externalUrl" error={errors.externalUrl?.message} hint="Link to Jira, GitHub, etc.">
            <Input id="externalUrl" type="url" inputMode="url" {...register("externalUrl")} />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : editing ? "Save changes" : "Create defect"}</Button>
            <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
