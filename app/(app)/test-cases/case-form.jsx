"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm } from "react-hook-form";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PRIORITIES, TYPES, AUTOMATION } from "@/lib/validation/testcase";
import { createCaseAction, updateCaseAction } from "@/app/actions/testcases";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/form-field";
import { NativeSelect } from "@/components/native-select";
import { label } from "./labels";

const EMPTY_STEP = { action: "", testData: "", expected: "" };

/** Tags are entered comma-separated and URLs one per line; both are normalised on submit and validated again by Zod on the server. */
export function CaseForm({ projectId, members, initial, caseId }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const editing = Boolean(caseId);
  const { register, control, handleSubmit, setError, formState: { errors } } = useForm({
    defaultValues: {
      title: initial?.title ?? "",
      description: initial?.description ?? "",
      preconditions: initial?.preconditions ?? "",
      testData: initial?.testData ?? "",
      priority: initial?.priority ?? "MEDIUM",
      type: initial?.type ?? "FUNCTIONAL",
      automation: initial?.automation ?? "MANUAL",
      component: initial?.component ?? "",
      tagsText: (initial?.tags ?? []).join(", "),
      requirementUrl: initial?.requirementUrl ?? "",
      defectUrlsText: (initial?.defectUrls ?? []).join("\n"),
      assigneeId: initial?.assigneeId ?? "",
      changeNote: "",
      steps: initial?.steps?.length ? initial.steps : [{ ...EMPTY_STEP }],
    },
  });
  const { fields, append, remove, move } = useFieldArray({ control, name: "steps" });

  const onSubmit = ({ tagsText, defectUrlsText, assigneeId, ...v }) =>
    start(async () => {
      const input = {
        ...v,
        assigneeId: assigneeId || null,
        tags: tagsText.split(",").map((t) => t.trim()).filter(Boolean),
        defectUrls: defectUrlsText.split("\n").map((t) => t.trim()).filter(Boolean),
      };
      const res = editing ? await updateCaseAction(projectId, caseId, input) : await createCaseAction(projectId, input);
      if (!res.ok) {
        for (const [k, m] of Object.entries(res.fieldErrors ?? {})) {
          const key = k === "tags" ? "tagsText" : k === "defectUrls" ? "defectUrlsText" : k;
          setError(key, { message: m });
        }
        return toast.error(res.error);
      }
      if (editing) {
        toast.success(res.data.changed ? `Saved as version ${res.data.version}` : "No changes to save");
        router.push(`/test-cases/${caseId}`);
      } else {
        toast.success(`Created ${res.data.code}`);
        router.push(`/test-cases/${res.data.id}`);
      }
      router.refresh();
    });

  const select = (name, list) => (
    <NativeSelect id={name} {...register(name)}>{list.map((o) => <option key={o} value={o}>{label(o)}</option>)}</NativeSelect>
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-4xl space-y-6" noValidate>
      <Card>
        <CardContent className="space-y-4 pt-6">
          <Field label="Title" htmlFor="title" error={errors.title?.message}>
            <Input id="title" {...register("title", { required: "Title is required" })} />
          </Field>
          <Field label="Description" htmlFor="description" error={errors.description?.message}>
            <Textarea id="description" rows={3} {...register("description")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Priority" htmlFor="priority">{select("priority", PRIORITIES)}</Field>
            <Field label="Type" htmlFor="type">{select("type", TYPES)}</Field>
            <Field label="Automation" htmlFor="automation">{select("automation", AUTOMATION)}</Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Component / module" htmlFor="component" error={errors.component?.message}>
              <Input id="component" {...register("component")} />
            </Field>
            <Field label="Assignee" htmlFor="assigneeId" error={errors.assigneeId?.message}>
              <NativeSelect id="assigneeId" {...register("assigneeId")}>
                <option value="">Unassigned</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </NativeSelect>
            </Field>
          </div>
          <Field label="Tags" htmlFor="tagsText" error={errors.tagsText?.message} hint="Comma separated, e.g. login, smoke">
            <Input id="tagsText" {...register("tagsText")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Requirement link" htmlFor="requirementUrl" error={errors.requirementUrl?.message}>
              <Input id="requirementUrl" type="url" placeholder="https://…" {...register("requirementUrl")} />
            </Field>
            <Field label="Related defect links" htmlFor="defectUrlsText" error={errors.defectUrlsText?.message} hint="One URL per line">
              <Textarea id="defectUrlsText" rows={2} {...register("defectUrlsText")} />
            </Field>
          </div>
          <Field label="Preconditions" htmlFor="preconditions" error={errors.preconditions?.message}>
            <Textarea id="preconditions" rows={2} {...register("preconditions")} />
          </Field>
          <Field label="Test data" htmlFor="testData" error={errors.testData?.message}>
            <Textarea id="testData" rows={2} {...register("testData")} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Steps</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {typeof errors.steps?.message === "string" && <p role="alert" className="text-xs text-destructive">{errors.steps.message}</p>}
          {fields.map((f, i) => (
            <div key={f.id} className="rounded-lg border p-3" data-testid="step-row">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">Step {i + 1}</span>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => move(i, i - 1)}><ArrowUp /></Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move step ${i + 1} down`} disabled={i === fields.length - 1} onClick={() => move(i, i + 1)}><ArrowDown /></Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove step ${i + 1}`} disabled={fields.length === 1} onClick={() => remove(i)}><Trash2 /></Button>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Action" htmlFor={`steps.${i}.action`} error={errors.steps?.[i]?.action?.message}>
                  <Textarea id={`steps.${i}.action`} rows={2} {...register(`steps.${i}.action`, { required: "Action is required" })} />
                </Field>
                <Field label="Test data" htmlFor={`steps.${i}.testData`}>
                  <Textarea id={`steps.${i}.testData`} rows={2} {...register(`steps.${i}.testData`)} />
                </Field>
                <Field label="Expected result" htmlFor={`steps.${i}.expected`} error={errors.steps?.[i]?.expected?.message}>
                  <Textarea id={`steps.${i}.expected`} rows={2} {...register(`steps.${i}.expected`, { required: "Expected result is required" })} />
                </Field>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => append({ ...EMPTY_STEP })}><Plus /> Add step</Button>
        </CardContent>
      </Card>

      {editing && (
        <Field label="Change note" htmlFor="changeNote" error={errors.changeNote?.message} hint="Optional. Shown in version history.">
          <Input id="changeNote" {...register("changeNote")} />
        </Field>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : editing ? "Save changes" : "Create test case"}</Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
      </div>
    </form>
  );
}
