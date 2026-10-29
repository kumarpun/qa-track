"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
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

/**
 * The form edits one combined step: each box holds one line per point (like a spreadsheet cell).
 * A case that already has several steps (e.g. from CSV import) is shown merged as numbered lines.
 */
const mergeSteps = (steps, key) => {
  if (!steps?.length) return "";
  if (steps.length === 1) return steps[0][key] ?? "";
  return steps.map((s, i) => (s[key] ? `${i + 1}. ${s[key]}` : "")).filter(Boolean).join("\n");
};

/** Tags are entered comma-separated and URLs one per line; both are normalised on submit and validated again by Zod on the server. */
export function CaseForm({ projectId, members, initial, caseId }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const editing = Boolean(caseId);
  const { register, handleSubmit, setError, formState: { errors } } = useForm({
    defaultValues: {
      title: initial?.title ?? "",
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
      stepAction: mergeSteps(initial?.steps, "action"),
      stepData: mergeSteps(initial?.steps, "testData"),
      stepExpected: mergeSteps(initial?.steps, "expected"),
    },
  });
  const onSubmit = ({ tagsText, defectUrlsText, assigneeId, stepAction, stepData, stepExpected, ...v }) =>
    start(async () => {
      const input = {
        ...v,
        // Description is no longer shown; keep any stored value so editing never wipes it.
        description: initial?.description ?? "",
        assigneeId: assigneeId || null,
        steps: [{ action: stepAction, testData: stepData, expected: stepExpected }],
        tags: tagsText.split(",").map((t) => t.trim()).filter(Boolean),
        defectUrls: defectUrlsText.split("\n").map((t) => t.trim()).filter(Boolean),
      };
      const res = editing ? await updateCaseAction(projectId, caseId, input) : await createCaseAction(projectId, input);
      if (!res.ok) {
        for (const [k, m] of Object.entries(res.fieldErrors ?? {})) {
          const step = k.match(/^steps\.0\.(action|testData|expected)$/)?.[1];
          const key = step ? { action: "stepAction", testData: "stepData", expected: "stepExpected" }[step] : k === "tags" ? "tagsText" : k === "defectUrls" ? "defectUrlsText" : k;
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Test steps</CardTitle></CardHeader>
        <CardContent>
          {typeof errors.steps?.message === "string" && <p role="alert" className="mb-3 text-xs text-destructive">{errors.steps.message}</p>}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Test steps" htmlFor="stepAction" error={errors.stepAction?.message} hint="One point per line, e.g. 1. Open the page">
              <Textarea id="stepAction" rows={6} {...register("stepAction", { required: "Test steps are required" })} />
            </Field>
            <Field label="Step test data" htmlFor="stepData" error={errors.stepData?.message}>
              <Textarea id="stepData" rows={6} {...register("stepData")} />
            </Field>
            <Field label="Expected result" htmlFor="stepExpected" error={errors.stepExpected?.message}>
              <Textarea id="stepExpected" rows={6} {...register("stepExpected", { required: "Expected result is required" })} />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-6">
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
