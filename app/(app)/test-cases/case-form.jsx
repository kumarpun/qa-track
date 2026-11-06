"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { toast } from "sonner";
import { AlignLeft, ImagePlus, Link2, Plus } from "lucide-react";
import { PRIORITIES, TYPES, AUTOMATION } from "@/lib/validation/testcase";
import { createCaseAction, updateCaseAction } from "@/app/actions/testcases";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { continueNumberedList, emptyEnterStepAt, emptyUploadStepAt, insertStepLine } from "@/lib/numbered-list";
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
const LONG_FIELDS = ["Description", "Content", "Summary", "Notes"];

const SAMPLE_IMAGE = "/samples/sample.jpg";

export function CaseForm({ projectId, members, initial, caseId, suite, linkable = [] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const editing = Boolean(caseId);
  const [showPre, setShowPre] = useState(Boolean(initial?.preconditions));
  const hasData = initial?.steps?.some((st) => st.testData);
  const [showData, setShowData] = useState(Boolean(hasData));
  const { register, control, handleSubmit, setError, setFocus, getValues, setValue, formState: { errors } } = useForm({
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
  const [linking, setLinking] = useState(false);
  const [linkQuery, setLinkQuery] = useState("");
  const [longOpen, setLongOpen] = useState(false);
  const [longTarget, setLongTarget] = useState(null);
  /** Opens the long-text popup; when the caret sits on an empty "Enter <field>:" step, the text fills that step. */
  const openLong = () => {
    const el = document.getElementById("stepAction");
    const text = getValues("stepAction");
    setLongTarget(emptyEnterStepAt(text, el?.selectionStart ?? text.length));
    setLongOpen(true);
  };
  const [longField, setLongField] = useState("Description");
  const [longValue, setLongValue] = useState("");
  const [upOpen, setUpOpen] = useState(false);
  const [upTarget, setUpTarget] = useState(null);
  const [upField, setUpField] = useState("Image");
  const [upFile, setUpFile] = useState(null);
  const [upSample, setUpSample] = useState(false); // use the bundled sample image instead of a chosen file
  const [uploading, setUploading] = useState(false);
  /** Opens the image popup; when the caret sits on an empty "Upload <field>:" step, the image fills that step. */
  const openUpload = () => {
    const el = document.getElementById("stepAction");
    const text = getValues("stepAction");
    setUpTarget(emptyUploadStepAt(text, el?.selectionStart ?? text.length));
    setUpOpen(true);
  };
  /** Stores the image on the server, then inserts "<n>. Upload <field>: <file name>"; the browser runner attaches that file to the field. */
  const insertUpload = async () => {
    if (!upFile && !upSample) return;
    setUploading(true);
    try {
      let file = upFile;
      if (upSample) {
        const img = await fetch(SAMPLE_IMAGE);
        if (!img.ok) throw new Error("Could not load the sample image");
        file = new File([await img.blob()], "sample.jpg", { type: "image/jpeg" });
      }
      const body = new FormData();
      body.set("projectId", projectId);
      body.set("file", file);
      const res = await fetch("/api/step-files", { method: "POST", body });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || "Upload failed");
      const el = document.getElementById("stepAction");
      const text = getValues("stepAction");
      let next, caret;
      if (upTarget) {
        const filled = `${upTarget.head} ${out.name}`;
        next = text.slice(0, upTarget.start) + filled + text.slice(upTarget.end);
        caret = upTarget.start + filled.length;
      } else {
        ({ text: next, caret } = insertStepLine(text, el?.selectionStart ?? text.length, `Upload ${upField.trim() || "Image"}: ${out.name}`));
      }
      setValue("stepAction", next, { shouldDirty: true, shouldValidate: true });
      setUpOpen(false);
      setUpFile(null);
      setUpSample(false);
      setTimeout(() => { setFocus("stepAction"); el?.setSelectionRange(caret, caret); }, 0);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  };
  const options = linkable.filter((c) => c.id !== caseId);
  const needle = linkQuery.trim().toLowerCase();
  const matches = options.filter((c) => !needle || `${c.code} ${c.title}`.toLowerCase().includes(needle)).slice(0, 50);
  /** Inserts "<n>. Call <title>" at the caret of the steps box; the runner then plays that case's steps at this point. */
  const linkCase = (c) => {
    // Title reads better; fall back to the code when another case shares the title (a title call would be ambiguous).
    const ref = options.filter((o) => o.title.trim().toLowerCase() === c.title.trim().toLowerCase()).length > 1 || /[\r\n]/.test(c.title) ? c.code : c.title.trim();
    const el = document.getElementById("stepAction");
    const text = getValues("stepAction");
    // The textarea keeps its caret after losing focus: the step goes where the user left it, not at the end.
    const { text: next, caret } = insertStepLine(text, el?.selectionStart ?? text.length, `Call ${ref}`);
    setValue("stepAction", next, { shouldDirty: true, shouldValidate: true });
    setLinking(false);
    setLinkQuery("");
    setTimeout(() => { setFocus("stepAction"); el?.setSelectionRange(caret, caret); }, 0);
  };
  /** Inserts "<n>. Enter <field>: \"\"\" ... \"\"\"": a fenced block, so paragraphs stay one step and read as a long value. */
  const insertLong = () => {
    const value = longValue.trim();
    if (!value) return;
    const el = document.getElementById("stepAction");
    const text = getValues("stepAction");
    let next, caret;
    if (longTarget) {
      // Fill the step the user was on: keep its own "Enter <field>:" wording.
      const fenced = `${longTarget.head} """\n${value}\n"""`;
      next = text.slice(0, longTarget.start) + fenced + text.slice(longTarget.end);
      caret = longTarget.start + fenced.length;
    } else {
      ({ text: next, caret } = insertStepLine(text, el?.selectionStart ?? text.length, `Enter ${longField.trim()}: """\n${value}\n"""`));
    }
    setValue("stepAction", next, { shouldDirty: true, shouldValidate: true });
    setLongOpen(false);
    setLongValue("");
    setTimeout(() => { setFocus("stepAction"); el?.setSelectionRange(caret, caret); }, 0);
  };
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
        <div className="flex flex-wrap items-center gap-2">
        {options.length > 0 && (
          <>
            {linking ? (
              <div className="relative w-full max-w-md" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setLinking(false); }}>
                <Input
                  autoFocus
                  role="combobox"
                  aria-expanded
                  aria-label="Search test cases to link"
                  placeholder="Search by code or title…"
                  value={linkQuery}
                  onChange={(e) => setLinkQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setLinking(false);
                    if (e.key === "Enter") { e.preventDefault(); if (matches[0]) linkCase(matches[0]); }
                  }}
                />
                <ul role="listbox" aria-label="Matching test cases" className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-popover p-1 text-sm shadow-md">
                  {matches.length === 0 && <li className="px-2 py-1.5 text-muted-foreground">No matching test cases</li>}
                  {matches.map((c) => (
                    <li key={c.id} role="option" aria-selected="false">
                      <button type="button" className="flex w-full gap-2 rounded px-2 py-1.5 text-left hover:bg-muted focus-visible:bg-muted" onClick={() => linkCase(c)}>
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">{c.code}</span>
                        <span className="truncate">{c.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <button type="button" onClick={() => setLinking(true)} className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-muted">
                <Link2 className="size-3" /> Link test case
              </button>
            )}
          </>
        )}
        <button type="button" onClick={openLong} className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-muted">
          <AlignLeft className="size-3" /> Long text
        </button>
        <button type="button" onClick={openUpload} className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-muted">
          <ImagePlus className="size-3" /> Upload image
        </button>
        {options.length > 0 && !linking && (
          <span className="text-xs text-muted-foreground">Link adds a “Call …” step that runs that case’s steps first (browser runs).</span>
        )}
        </div>
        <Dialog open={upOpen} onOpenChange={setUpOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Upload image</DialogTitle>
              <DialogDescription>The image is saved with the project and added as an “Upload &lt;field&gt;: file” step the browser run attaches to that file field.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {upTarget ? (
                <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">Fills step: <span className="font-medium">{upTarget.head}</span></p>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="upField">Field</Label>
                  <Input id="upField" value={upField} onChange={(e) => setUpField(e.target.value)} placeholder="Image" />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Use the sample image</Label>
                <button type="button" aria-pressed={upSample} onClick={() => { setUpSample((v) => !v); setUpFile(null); const f = document.getElementById("upFile"); if (f) f.value = ""; }}
                  className={`flex w-full items-center gap-3 rounded-lg border p-2 text-left text-sm hover:bg-muted ${upSample ? "border-primary ring-2 ring-primary/30" : ""}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={SAMPLE_IMAGE} alt="Sample plant" className="h-16 w-12 rounded object-cover" />
                  <span><span className="font-medium">sample.jpg</span><span className="block text-xs text-muted-foreground">{upSample ? "Selected" : "Click to use this image"}</span></span>
                </button>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="upFile">Or choose your own image</Label>
                <Input id="upFile" type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={(e) => { setUpFile(e.target.files?.[0] ?? null); if (e.target.files?.[0]) setUpSample(false); }} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setUpOpen(false)}>Cancel</Button>
              <Button type="button" disabled={(!upFile && !upSample) || uploading} onClick={insertUpload}>{uploading ? "Uploading…" : "Add step"}</Button>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={longOpen} onOpenChange={setLongOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Enter long text</DialogTitle>
              <DialogDescription>Pick the field, write the full text, and it is added as one step.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {longTarget ? (
                <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">Fills step: <span className="font-medium">{longTarget.head}</span></p>
              ) : (
              <div className="space-y-1.5">
                <Label>Field</Label>
                <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Field">
                  {LONG_FIELDS.map((f) => (
                    <button key={f} type="button" role="radio" aria-checked={longField === f} onClick={() => setLongField(f)} className={`rounded-full border px-3 py-1 text-xs ${longField === f ? "border-ring bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-muted"}`}>
                      {f}
                    </button>
                  ))}
                  <Input aria-label="Custom field name" placeholder="Other field…" className="h-7 w-36" value={LONG_FIELDS.includes(longField) ? "" : longField} onChange={(e) => setLongField(e.target.value)} />
                </div>
              </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="longValue">Text</Label>
                <Textarea id="longValue" autoFocus rows={12} placeholder={"Write or paste the full text.\nBlank lines between paragraphs are kept."} value={longValue} onChange={(e) => setLongValue(e.target.value)} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{longValue.trim().length} characters · shown collapsed with “See more”</span>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setLongOpen(false)}>Cancel</Button>
                  <Button type="button" onClick={insertLong} disabled={!longValue.trim() || (!longTarget && !longField.trim())}>Add as step</Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        <Section id="stepAction" title="Test steps" error={errors.stepAction?.message}>
          <Textarea id="stepAction" rows={10} onKeyDown={continueNumberedList} placeholder={`Test steps\n${SAMPLE_STEPS}`} className={`${quiet.replace("border-transparent ", "")} min-h-64`} {...register("stepAction", { required: "Test steps are required" })} />
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
