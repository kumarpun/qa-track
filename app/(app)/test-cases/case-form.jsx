"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { PRIORITIES, TYPES, AUTOMATION } from "@/lib/validation/testcase";
import { createCaseAction, updateCaseAction } from "@/app/actions/testcases";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { label } from "./labels";
import { LabelPicker } from "./label-picker";
import { SampleFormat, SAMPLE_STEPS } from "./sample-format";

function Section({ id, title, error, hint, children }) {
  return (
    <section className="space-y-1">
      <Label htmlFor={id} className="sr-only">{title}</Label>
      {children}
      {hint && !error && <p className="px-2.5 text-xs text-muted-foreground">{hint}</p>}
      {error && <p role="alert" className="px-2.5 text-xs text-destructive">{error}</p>}
    </section>
  );
}

function Prop({ id, name, error, children }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <Label htmlFor={id} className="w-24 shrink-0 text-muted-foreground">{name}</Label>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      {error && <p role="alert" className="ml-26 text-xs text-destructive">{error}</p>}
    </div>
  );
}

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
export function CaseForm({ projectId, members, initial, caseId, suite }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const editing = Boolean(caseId);
  const [showPre, setShowPre] = useState(Boolean(initial?.preconditions));
  const hasData = initial?.steps?.some((st) => st.testData);
  const [showData, setShowData] = useState(Boolean(hasData));
  const { register, control, handleSubmit, setError, setFocus, formState: { errors } } = useForm({
    defaultValues: {
      title: initial?.title ?? "",
      preconditions: initial?.preconditions ?? "",
      priority: initial?.priority ?? "MEDIUM",
      type: initial?.type ?? "FUNCTIONAL",
      automation: initial?.automation ?? "MANUAL",
      component: initial?.component ?? "",
      tagsText: (initial?.tags ?? []).join(", "),
      requirementUrl: initial?.requirementUrl ?? "",
      defectUrlsText: (initial?.defectUrls ?? []).join("\n"),
      assigneeId: initial?.assigneeId ?? "",
      stepAction: mergeSteps(initial?.steps, "action"),
      stepData: mergeSteps(initial?.steps, "testData"),
      stepExpected: mergeSteps(initial?.steps, "expected"),
    },
  });
  const onSubmit = ({ tagsText, defectUrlsText, assigneeId, stepAction, stepData, stepExpected, ...v }) =>
    start(async () => {
      const input = {
        ...v,
        // Description and case-level test data are no longer shown; keep stored values so editing never wipes them.
        description: initial?.description ?? "",
        testData: initial?.testData ?? "",
        assigneeId: assigneeId || null,
        steps: [{ action: stepAction, testData: stepData, expected: stepExpected }],
        tags: tagsText.split(",").map((t) => t.trim()).filter(Boolean),
        defectUrls: defectUrlsText.split("\n").map((t) => t.trim()).filter(Boolean),
      };
      const res = editing ? await updateCaseAction(projectId, caseId, input) : await createCaseAction(projectId, input, suite?.id);
      if (!res.ok) {
        for (const [k, m] of Object.entries(res.fieldErrors ?? {})) {
          const step = k.match(/^steps\.0\.(action|testData|expected)$/)?.[1];
          const key = step ? { action: "stepAction", testData: "stepData", expected: "stepExpected" }[step] : k === "tags" ? "tagsText" : k === "defectUrls" ? "defectUrlsText" : k;
          setError(key, { message: m });
        }
        return toast.error(res.error);
      }
      if (editing) {
        toast.success(res.data.changed ? "Saved" : "No changes to save");
        router.push(`/test-cases/${caseId}`);
      } else {
        toast.success(suite ? `Created ${res.data.code} and added it to ${suite.name}` : `Created ${res.data.code}`);
        router.push(suite ? `/test-suites/${suite.id}` : `/test-cases/${res.data.id}`);
      }
      router.refresh();
    });


  const quiet = "border-transparent bg-transparent px-2.5 hover:border-input dark:bg-transparent";
  const select = (name, list) => (
    <NativeSelect id={name} className={quiet} {...register(name)}>{list.map((o) => <option key={o} value={o}>{label(o)}</option>)}</NativeSelect>
  );
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]" noValidate>
      <div className="space-y-3">
        <div>
          <Label htmlFor="title" className="sr-only">Title</Label>
          <Input
            id="title"
            placeholder="Test case title"
            className={`h-auto ${quiet} py-2 text-2xl font-semibold md:text-2xl`}
            {...register("title", { required: "Title is required" })}
          />
          {errors.title && <p role="alert" className="px-2.5 text-xs text-destructive">{errors.title.message}</p>}
        </div>
        {typeof errors.steps?.message === "string" && <p role="alert" className="px-2.5 text-xs text-destructive">{errors.steps.message}</p>}

        {!editing && <SampleFormat className="mr-2" />}
        {showPre ? (
          <Section id="preconditions" title="Preconditions" error={errors.preconditions?.message}>
            <Textarea
              id="preconditions"
              rows={1}
              autoFocus={!initial?.preconditions}
              placeholder="Preconditions: what must be true before starting"
              className={`${quiet} min-h-9`}
              {...register("preconditions", { onBlur: (e) => { if (!e.target.value.trim()) setShowPre(false); } })}
            />
          </Section>
        ) : (
          <button
            type="button"
            onClick={() => { setShowPre(true); setTimeout(() => setFocus("preconditions"), 0); }}
            className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-muted"
          >
            <Plus className="size-3" /> Preconditions
          </button>
        )}
        <Section id="stepAction" title="Test steps" error={errors.stepAction?.message}>
          <Textarea id="stepAction" rows={10} placeholder={`Test steps\n${SAMPLE_STEPS}`} className={`${quiet.replace("border-transparent ", "")} min-h-64`} {...register("stepAction", { required: "Test steps are required" })} />
        </Section>
        {showData ? (
          <Section id="stepData" title="Test data" error={errors.stepData?.message}>
            <Textarea
              id="stepData"
              rows={1}
              autoFocus={!hasData}
              placeholder="Test data, e.g. Email: test@example.com"
              className={`${quiet} min-h-9`}
              {...register("stepData", { onBlur: (e) => { if (!e.target.value.trim()) setShowData(false); } })}
            />
          </Section>
        ) : (
          <button
            type="button"
            onClick={() => { setShowData(true); setTimeout(() => setFocus("stepData"), 0); }}
            className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-muted"
          >
            <Plus className="size-3" /> Test data
          </button>
        )}
        <Section id="stepExpected" title="Expected result" error={errors.stepExpected?.message}>
          <Textarea id="stepExpected" rows={1} placeholder="Expected result: what should happen" className={`${quiet} min-h-9`} {...register("stepExpected", { required: "Expected result is required" })} />
        </Section>

        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : editing ? "Save changes" : "Create test case"}</Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
        </div>
      </div>

      <aside className="h-fit space-y-8">
        <div className="space-y-2">
          <h3 className="text-sm text-muted-foreground">Properties</h3>
          <Prop id="priority" name="Priority">{select("priority", PRIORITIES)}</Prop>
          <Prop id="type" name="Type">{select("type", TYPES)}</Prop>
          <Prop id="automation" name="Automation">{select("automation", AUTOMATION)}</Prop>
          <Prop id="assigneeId" name="Assignee" error={errors.assigneeId?.message}>
            <NativeSelect id="assigneeId" className={quiet} {...register("assigneeId")}>
              <option value="">Unassigned</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </NativeSelect>
          </Prop>
          <Prop id="component" name="Component" error={errors.component?.message}>
            <Input id="component" placeholder="Module" className={quiet} {...register("component")} />
          </Prop>
        </div>
        <div className="space-y-2">
          <h3 className="text-sm text-muted-foreground">Labels</h3>
          <Label htmlFor="tagsText" className="sr-only">Tags</Label>
          <Controller
            name="tagsText"
            control={control}
            render={({ field }) => (
              <LabelPicker id="tagsText" value={field.value.split(",").map((t) => t.trim()).filter(Boolean)} onChange={(tags) => field.onChange(tags.join(", "))} />
            )}
          />
          {errors.tagsText && <p role="alert" className="text-xs text-destructive">{errors.tagsText.message}</p>}
        </div>
        <div className="space-y-2">
          <h3 className="text-sm text-muted-foreground">Links</h3>
          <Label htmlFor="requirementUrl" className="sr-only">Requirement link</Label>
          <Input id="requirementUrl" type="url" placeholder="Requirement https://…" className={quiet} {...register("requirementUrl")} />
          {errors.requirementUrl && <p role="alert" className="text-xs text-destructive">{errors.requirementUrl.message}</p>}
          <Label htmlFor="defectUrlsText" className="sr-only">Related defect links</Label>
          <Textarea id="defectUrlsText" rows={2} placeholder="Related defects, one URL per line" className={quiet} {...register("defectUrlsText")} />
          {errors.defectUrlsText && <p role="alert" className="text-xs text-destructive">{errors.defectUrlsText.message}</p>}
        </div>
      </aside>
    </form>
  );
}
