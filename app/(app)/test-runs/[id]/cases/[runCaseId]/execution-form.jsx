"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, Plus } from "lucide-react";
import { toast } from "sonner";
import { executionSchema } from "@/lib/validation/execution";
import { createDefectAction, recordExecutionAction } from "@/app/actions/executions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/form-field";
import { NativeSelect } from "@/components/native-select";
import { STATUS_LABELS } from "@/lib/metrics";

const RESULTS = ["PASSED", "FAILED", "BLOCKED", "SKIPPED", "RETEST"];
const STEP_OPTIONS = ["NOT_RUN", "PASSED", "FAILED", "BLOCKED", "SKIPPED"];

export function ExecutionForm({ projectId, runCaseId, steps, defects: initialDefects, canReportDefects }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const fileRef = useRef(null);
  const [status, setStatus] = useState("");
  const [actualResult, setActualResult] = useState("");
  const [comment, setComment] = useState("");
  const [stepState, setStepState] = useState(() => steps.map((s) => ({ position: s.position, status: "NOT_RUN", actualResult: "" })));
  const [defects, setDefects] = useState(initialDefects);
  const [linked, setLinked] = useState(() => new Set());
  const [errors, setErrors] = useState({});
  const [newDefect, setNewDefect] = useState(null);

  const setStep = (i, patch) => setStepState((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const toggle = (id) => setLinked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const submit = (e) => {
    e.preventDefault();
    const payload = {
      status,
      actualResult,
      comment,
      steps: stepState.filter((s) => s.status !== "NOT_RUN" || s.actualResult.trim()),
      defectIds: [...linked],
    };
    const parsed = executionSchema.safeParse(payload);
    if (!parsed.success) {
      const fe = {};
      for (const i of parsed.error.issues) fe[i.path[0]] ??= i.message;
      setErrors(fe);
      return;
    }
    setErrors({});
    start(async () => {
      const res = await recordExecutionAction(projectId, runCaseId, parsed.data);
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        return toast.error(res.error);
      }
      const files = [...(fileRef.current?.files ?? [])];
      if (files.length) {
        const fd = new FormData();
        fd.set("executionId", res.data.id);
        files.forEach((f) => fd.append("file", f));
        const up = await fetch("/api/attachments", { method: "POST", body: fd });
        if (!up.ok) toast.error((await up.json().catch(() => ({}))).error ?? "Result saved, but the attachment upload failed");
      }
      toast.success(`Recorded ${STATUS_LABELS[status]}`);
      setStatus(""); setActualResult(""); setComment(""); setLinked(new Set());
      setStepState((s) => s.map((x) => ({ ...x, status: "NOT_RUN", actualResult: "" })));
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    });
  };

  const reportDefect = (e) => {
    e.preventDefault();
    start(async () => {
      const res = await createDefectAction(projectId, newDefect);
      if (!res.ok) return toast.error(res.fieldErrors ? Object.values(res.fieldErrors)[0] : res.error);
      setDefects((d) => [{ ...res.data, status: "OPEN" }, ...d]);
      setLinked((s) => new Set(s).add(res.data.id));
      setNewDefect(null);
      toast.success(`Created ${res.data.code}`);
    });
  };

  return (
    <Card>
      <CardHeader><CardTitle>Record result</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Result</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Result">
              {RESULTS.map((r) => (
                <label key={r} className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm ${status === r ? "border-primary bg-primary/10" : ""}`}>
                  <input type="radio" name="result" value={r} checked={status === r} onChange={() => setStatus(r)} className="sr-only" />
                  {STATUS_LABELS[r]}
                </label>
              ))}
            </div>
            {errors.status && <p role="alert" className="mt-1 text-xs text-destructive">{errors.status}</p>}
          </fieldset>

          {steps.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Step results (optional)</h3>
              {steps.map((s, i) => (
                <div key={s.position} className="grid gap-2 rounded-md border p-2 sm:grid-cols-[2rem_1fr_9rem_1fr] sm:items-center">
                  <span className="text-xs text-muted-foreground">#{s.position}</span>
                  <span className="text-sm">{s.action}</span>
                  <NativeSelect aria-label={`Step ${s.position} result`} value={stepState[i].status} onChange={(e) => setStep(i, { status: e.target.value })}>
                    {STEP_OPTIONS.map((o) => <option key={o} value={o}>{STATUS_LABELS[o]}</option>)}
                  </NativeSelect>
                  <Input aria-label={`Step ${s.position} actual result`} placeholder="Actual result" value={stepState[i].actualResult} onChange={(e) => setStep(i, { actualResult: e.target.value })} />
                </div>
              ))}
            </div>
          )}

          <Field label={status === "FAILED" ? "Actual result (required)" : "Actual result"} htmlFor="actualResult" error={errors.actualResult}>
            <Textarea id="actualResult" rows={3} value={actualResult} onChange={(e) => setActualResult(e.target.value)} />
          </Field>
          <Field label="Comment" htmlFor="execComment" error={errors.comment}>
            <Textarea id="execComment" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Link defects</h3>
              {canReportDefects && !newDefect && (
                <Button type="button" size="sm" variant="outline" onClick={() => setNewDefect({ title: "", description: "", severity: "MAJOR", priority: "MEDIUM", externalUrl: "" })}>
                  <Plus /> Report new defect
                </Button>
              )}
            </div>
            {newDefect && (
              <div className="space-y-2 rounded-md border p-3">
                <Field label="Defect title" htmlFor="defTitle">
                  <Input id="defTitle" value={newDefect.title} onChange={(e) => setNewDefect({ ...newDefect, title: e.target.value })} />
                </Field>
                <Field label="Defect description" htmlFor="defDesc">
                  <Textarea id="defDesc" rows={2} value={newDefect.description} onChange={(e) => setNewDefect({ ...newDefect, description: e.target.value })} />
                </Field>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Field label="Severity" htmlFor="defSev">
                    <NativeSelect id="defSev" value={newDefect.severity} onChange={(e) => setNewDefect({ ...newDefect, severity: e.target.value })}>
                      {["CRITICAL", "MAJOR", "MINOR", "TRIVIAL"].map((o) => <option key={o} value={o}>{o[0] + o.slice(1).toLowerCase()}</option>)}
                    </NativeSelect>
                  </Field>
                  <Field label="Priority" htmlFor="defPri">
                    <NativeSelect id="defPri" value={newDefect.priority} onChange={(e) => setNewDefect({ ...newDefect, priority: e.target.value })}>
                      {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((o) => <option key={o} value={o}>{o[0] + o.slice(1).toLowerCase()}</option>)}
                    </NativeSelect>
                  </Field>
                  <Field label="External URL" htmlFor="defUrl">
                    <Input id="defUrl" placeholder="https://…" value={newDefect.externalUrl} onChange={(e) => setNewDefect({ ...newDefect, externalUrl: e.target.value })} />
                  </Field>
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" disabled={pending} onClick={reportDefect}>Create defect</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setNewDefect(null)}>Cancel</Button>
                </div>
              </div>
            )}
            {defects.length === 0 ? <p className="text-sm text-muted-foreground">No open defects to link.</p> : (
              <ul className="max-h-40 space-y-1 overflow-auto rounded-md border p-2">
                {defects.map((d) => (
                  <li key={d.id}>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={linked.has(d.id)} onChange={() => toggle(d.id)} />
                      <span className="font-mono text-xs">{d.code}</span> {d.title}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Field label="Attachments" htmlFor="files" hint="Images, PDF, text, logs, video, zip — up to 8 MB each, 10 files.">
            <div className="flex items-center gap-2">
              <Paperclip className="size-4 text-muted-foreground" />
              <input id="files" ref={fileRef} type="file" multiple className="text-sm" />
            </div>
          </Field>

          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save result"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
