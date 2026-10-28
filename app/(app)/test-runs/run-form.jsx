"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ENVIRONMENTS, PLATFORMS } from "@/lib/validation/run";
import { createRunAction } from "@/app/actions/runs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/form-field";
import { NativeSelect } from "@/components/native-select";
import { label } from "../test-cases/labels";

const toggled = (set, id) => { const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); return n; };

export function RunForm({ projectId, options, caseLimit, defaultSuiteId }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [suiteIds, setSuiteIds] = useState(() => new Set(defaultSuiteId ? [defaultSuiteId] : []));
  const [caseIds, setCaseIds] = useState(() => new Set());
  const [testerIds, setTesterIds] = useState(() => new Set());
  const [caseQ, setCaseQ] = useState("");
  const [selectionError, setSelectionError] = useState("");
  const { register, handleSubmit, setError, formState: { errors } } = useForm({
    defaultValues: { name: "", description: "", environment: "QA", buildVersion: "", platform: "", plannedStart: "", plannedEnd: "" },
  });

  const shownCases = useMemo(() => {
    const q = caseQ.trim().toLowerCase();
    return q ? options.cases.filter((c) => c.code.toLowerCase().includes(q) || c.title.toLowerCase().includes(q)) : options.cases;
  }, [caseQ, options.cases]);

  const onSubmit = (v) => {
    setSelectionError("");
    start(async () => {
      const res = await createRunAction(projectId, { ...v, suiteIds: [...suiteIds], caseIds: [...caseIds], testerIds: [...testerIds] });
      if (!res.ok) {
        for (const [k, m] of Object.entries(res.fieldErrors ?? {})) {
          if (k === "caseIds" || k === "suiteIds") setSelectionError(m);
          else setError(k, { message: m });
        }
        return toast.error(res.error);
      }
      toast.success(`Created ${res.data.code} with ${res.data.cases} test case(s)`);
      router.push(`/test-runs/${res.data.id}`);
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-3xl space-y-6" noValidate>
      <Card>
        <CardContent className="space-y-4 pt-6">
          <Field label="Name" htmlFor="name" error={errors.name?.message}>
            <Input id="name" {...register("name", { required: "Name is required" })} />
          </Field>
          <Field label="Description" htmlFor="description" error={errors.description?.message}>
            <Textarea id="description" rows={3} {...register("description")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Environment" htmlFor="environment" error={errors.environment?.message}>
              <NativeSelect id="environment" {...register("environment")}>
                {ENVIRONMENTS.map((e) => <option key={e} value={e}>{label(e)}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Build / version" htmlFor="buildVersion" error={errors.buildVersion?.message}>
              <Input id="buildVersion" {...register("buildVersion")} />
            </Field>
            <Field label="Platform" htmlFor="platform" error={errors.platform?.message}>
              <NativeSelect id="platform" {...register("platform")}>
                <option value="">Web (default)</option>
                {PLATFORMS.map((e) => <option key={e} value={e}>{label(e)}</option>)}
              </NativeSelect>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Planned start" htmlFor="plannedStart" error={errors.plannedStart?.message}>
              <Input id="plannedStart" type="date" {...register("plannedStart")} />
            </Field>
            <Field label="Planned end" htmlFor="plannedEnd" error={errors.plannedEnd?.message}>
              <Input id="plannedEnd" type="date" {...register("plannedEnd")} />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Testers</CardTitle></CardHeader>
        <CardContent>
          {options.testers.length === 0 ? <p className="text-sm text-muted-foreground">No assignable members.</p> : (
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {options.testers.map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={testerIds.has(t.id)} onChange={() => setTesterIds((s) => toggled(s, t.id))} /> {t.name}
                </label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Scope</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div>
            <h3 className="mb-2 text-sm font-medium">Suites</h3>
            {options.suites.length === 0 ? <p className="text-sm text-muted-foreground">No active suites.</p> : (
              <ul className="space-y-1">
                {options.suites.map((s) => (
                  <li key={s.id}>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={suiteIds.has(s.id)} onChange={() => setSuiteIds((x) => toggled(x, s.id))} />
                      {s.name} <span className="text-xs text-muted-foreground">({s.caseCount} cases)</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium">Individual test cases</h3>
            <Input aria-label="Filter test cases" placeholder="Filter by title or code…" value={caseQ} onChange={(e) => setCaseQ(e.target.value)} className="mb-2" />
            <ul className="max-h-64 space-y-1 overflow-auto rounded-md border p-2">
              {shownCases.length === 0 && <li className="text-sm text-muted-foreground">No test cases match.</li>}
              {shownCases.map((c) => (
                <li key={c.id}>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={caseIds.has(c.id)} onChange={() => setCaseIds((x) => toggled(x, c.id))} />
                    <span className="font-mono text-xs">{c.code}</span> {c.title}
                  </label>
                </li>
              ))}
            </ul>
            {options.cases.length >= caseLimit && <p className="mt-1 text-xs text-muted-foreground">Showing the first {caseLimit} cases; use suites for larger selections.</p>}
          </div>
          {selectionError && <p role="alert" className="text-sm text-destructive">{selectionError}</p>}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create run"}</Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
      </div>
    </form>
  );
}
