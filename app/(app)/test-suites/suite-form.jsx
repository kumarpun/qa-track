"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { TYPES } from "@/lib/validation/testcase";
import { createSuiteAction, updateSuiteAction } from "@/app/actions/suites";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Field } from "@/components/form-field";
import { NativeSelect } from "@/components/native-select";
import { label } from "../test-cases/labels";

/** `parents` are the suites this one may be nested under (callers exclude the suite itself and its descendants). */
export function SuiteForm({ projectId, parents, initial, suiteId, defaultParentId = "" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const editing = Boolean(suiteId);
  const { register, handleSubmit, setError, formState: { errors } } = useForm({
    defaultValues: {
      name: initial?.name ?? "",
      description: initial?.description ?? "",
      feature: initial?.feature ?? "",
      type: initial?.type ?? "",
      tagsText: (initial?.tags ?? []).join(", "),
      parentId: initial?.parentId ?? defaultParentId,
    },
  });

  const onSubmit = ({ tagsText, parentId, ...v }) =>
    start(async () => {
      const input = { ...v, parentId: parentId || null, tags: tagsText.split(",").map((t) => t.trim()).filter(Boolean) };
      const res = editing ? await updateSuiteAction(projectId, suiteId, input) : await createSuiteAction(projectId, input);
      if (!res.ok) {
        for (const [k, m] of Object.entries(res.fieldErrors ?? {})) setError(k === "tags" ? "tagsText" : k, { message: m });
        return toast.error(res.error);
      }
      toast.success(editing ? "Suite saved" : "Suite created");
      router.push(`/test-suites/${editing ? suiteId : res.data.id}`);
      router.refresh();
    });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl" noValidate>
      <Card>
        <CardContent className="space-y-4 pt-6">
          <Field label="Name" htmlFor="name" error={errors.name?.message}>
            <Input id="name" {...register("name", { required: "Name is required" })} />
          </Field>
          <Field label="Description" htmlFor="description" error={errors.description?.message}>
            <Textarea id="description" rows={3} {...register("description")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Feature / module" htmlFor="feature" error={errors.feature?.message}>
              <Input id="feature" {...register("feature")} />
            </Field>
            <Field label="Type" htmlFor="type" error={errors.type?.message}>
              <NativeSelect id="type" {...register("type")}>
                <option value="">Not set</option>
                {TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
              </NativeSelect>
            </Field>
          </div>
          <Field label="Parent suite" htmlFor="parentId" error={errors.parentId?.message}>
            <NativeSelect id="parentId" {...register("parentId")}>
              <option value="">None (top level)</option>
              {parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Tags" htmlFor="tagsText" error={errors.tagsText?.message} hint="Comma separated">
            <Input id="tagsText" {...register("tagsText")} />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : editing ? "Save changes" : "Create suite"}</Button>
            <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
