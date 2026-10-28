"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { importCsvAction } from "@/app/actions/testcases";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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

  return (
    <div className="max-w-3xl space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-6">
          <label htmlFor="csv" className="text-sm font-medium">CSV file</label>
          <input id="csv" type="file" accept=".csv,text/csv" onChange={onFile} className="block w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium" />
          <p className="text-xs text-muted-foreground">
            One row per step. A row with a title starts a new case; following rows with only step columns add steps to it.
            Columns: <code className="font-mono">{headers.join(", ")}</code>. The <code className="font-mono">code</code> column is ignored; new codes are assigned.
          </p>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardContent className="space-y-3 pt-6" data-testid="import-preview">
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
