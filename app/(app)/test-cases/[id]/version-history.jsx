"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { restoreVersionAction } from "@/app/actions/testcases";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function VersionHistory({ projectId, caseId, current, canRestore, versions }) {
  const router = useRouter();
  const [open, setOpen] = useState(null);
  const [restoring, setRestoring] = useState(null);
  const [pending, start] = useTransition();

  const restore = (version) =>
    start(async () => {
      const res = await restoreVersionAction(projectId, caseId, version);
      if (!res.ok) return toast.error(res.error);
      toast.success(res.data.changed ? `Restored v${version} as v${res.data.version}` : "Already identical to the current version");
      router.refresh();
    });

  return (
    <>
      <ul className="divide-y" data-testid="version-list">
        {versions.map((v) => (
          <li key={v.version} className="py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm">
                <span className="font-medium">v{v.version}</span>
                {v.version === current && <Badge variant="secondary" className="ml-2">Current</Badge>}
                <span className="ml-2 text-muted-foreground">{v.authorName} · {v.createdAt}</span>
                {v.note && <span className="ml-2">— {v.note}</span>}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setOpen(open === v.version ? null : v.version)}>{open === v.version ? "Hide" : "View"}</Button>
                {canRestore && v.version !== current && (
                  <Button variant="outline" size="sm" disabled={pending} onClick={() => setRestoring(v.version)}>Restore</Button>
                )}
              </div>
            </div>
            {open === v.version && (
              <div className="mt-3 space-y-2 rounded-md bg-muted/50 p-3 text-sm">
                <div className="font-medium">{v.snapshot.title}</div>
                <div className="text-muted-foreground">
                  {v.snapshot.priority} · {v.snapshot.type} · {v.snapshot.automation}
                </div>
                <ol className="list-decimal space-y-1 pl-5">
                  {(v.snapshot.steps ?? []).map((s, i) => (
                    <li key={i}>{s.action} <span className="text-muted-foreground">→ {s.expected}</span></li>
                  ))}
                </ol>
              </div>
            )}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={restoring !== null}
        onOpenChange={(o) => !o && setRestoring(null)}
        title={`Restore version ${restoring}?`}
        description="This creates a new version with that content. Earlier versions are never overwritten."
        confirmLabel="Restore"
        onConfirm={() => { restore(restoring); setRestoring(null); }}
      />
    </>
  );
}
