"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { importCsvAction } from "@/app/actions/testcases";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const FIELD_LABEL = {
  testData: "test_data", requirementUrl: "requirement_url", assigneeEmail: "assignee_email",
  stepAction: "step_action", stepData: "step_data", stepExpected: "step_expected",
  severity: "label severity:…", notes: "description (remarks)",
};

export function ImportForm({ projectId, headers }) {
  const router = useRouter();
  const [text, setText] = useState(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState(null);
  const [pending, start] = useTransition();

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    setPreview(null);
    if (!file) return setText(null);
    setFileName(file.name);
    const content = await file.text();
    setText(content);
    start(async () => {
      const res = await importCsvAction(projectId, content, true);
      if (!res.ok) return toast.error(res.error);
      setPreview(res.data);
    });
  };

  const confirm = () =>
    start(async () => {
      const res = await importCsvAction(projectId, text, false);
      if (!res.ok) return toast.error(res.error);
      if (res.data.errors?.length) return setPreview(res.data);
      toast.success(`Imported ${res.data.created} test case(s)`);
      router.push("/test-cases");
      router.refresh();
    });

  const errors = preview?.errors ?? [];
  const mapping = (preview?.mapping ?? []).filter((m) => m.field !== "code");
  const ignored = preview?.ignored ?? [];

  return (
    <div className="max-w-3xl space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-6">
          <label htmlFor="csv" className="text-sm font-medium">CSV file</label>
          <input id="csv" type="file" accept=".csv,text/csv" onChange={onFile} className="block w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium" />
          <p className="text-xs text-muted-foreground">
            One row per step. A row with a test case name starts a new case; following rows with only step columns add steps to it.
            Column names are matched automatically, so other spreadsheets work too. Required: <code className="font-mono">Test Case</code>, <code className="font-mono">Test Steps</code>, <code className="font-mono">Expected Result</code>.
            Others: <code className="font-mono">{headers.filter((h) => !["Test Case", "Test Steps", "Expected Result"].includes(h)).join(", ")}</code>.
            The <code className="font-mono">TC ID</code> column is ignored; new codes are assigned.{" "}
            <a href="/templates/test-cases-import-template.csv" download className="font-medium text-primary underline">Download the template CSV</a> to see the expected headers with example rows.
          </p>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardContent className="space-y-3 pt-6" data-testid="import-preview">
            {mapping.length > 0 && (
              <div className="space-y-1" data-testid="import-mapping">
                <p className="text-sm font-medium">Detected columns</p>
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {mapping.map((m) => <li key={m.field}><span className="text-foreground">{m.column}</span> → <span className="font-mono">{FIELD_LABEL[m.field] ?? m.field}</span></li>)}
                </ul>
                {ignored.length > 0 && <p className="text-xs text-muted-foreground">Not imported: {ignored.join(", ")}</p>}
              </div>
            )}
            {errors.length === 0 ? (
              <>
                <p className="text-sm"><strong>{preview.valid}</strong> test case(s) ready to import from <em>{fileName}</em>.</p>
                <Button onClick={confirm} disabled={pending || preview.valid === 0}>{pending ? "Importing…" : "Confirm import"}</Button>
              </>
            ) : (
              <>
                <p role="alert" className="text-sm font-medium text-destructive">{errors.length} problem(s) found. Nothing was imported.</p>
                <ul className="space-y-1 text-sm">
                  {errors.slice(0, 50).map((er, i) => <li key={i}><span className="font-mono text-xs">Line {er.line}</span> — {er.message}</li>)}
                  {errors.length > 50 && <li className="text-muted-foreground">…and {errors.length - 50} more</li>}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
