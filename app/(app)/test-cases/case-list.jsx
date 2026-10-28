"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { PRIORITIES, TYPES, AUTOMATION } from "@/lib/validation/testcase";
import { bulkAction } from "@/app/actions/testcases";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeSelect } from "@/components/native-select";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { label, PRIORITY_TONE } from "./labels";

const SORTABLE = [
  ["code", "Code"],
  ["title", "Title"],
  ["priority", "Priority"],
  ["type", "Type"],
  ["updated_at", "Updated"],
];

export function CaseList({ projectId, rows, page, pages, total, params, canWrite, members }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [selected, setSelected] = useState(() => new Set());
  const [pending, startTransition] = useTransition();
  const [confirmArchive, setConfirmArchive] = useState(false);

  const go = (patch) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, String(v)) : next.delete(k));
    router.push(`${pathname}?${next}`);
  };
  const sortBy = (col) => go({ sort: col, dir: params.sort === col && params.dir === "asc" ? "desc" : "asc", page: "" });

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));

  const runBulk = (op, value) =>
    startTransition(async () => {
      const res = await bulkAction(projectId, { ids: [...selected], op, value });
      if (res.ok) {
        toast.success(`Updated ${res.data?.affected ?? 0} of ${selected.size} test case(s)`);
        setSelected(new Set());
        router.refresh();
      } else toast.error(res.error);
    });

  const pick = (op, options) => (
    <NativeSelect
      aria-label={`Set ${op}`}
      className="w-auto"
      value=""
      disabled={pending}
      onChange={(e) => e.target.value && runBulk(op, e.target.value === "__none" ? null : e.target.value)}
    >
      <option value="">Set {op}…</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </NativeSelect>
  );
  const opts = (list) => list.map((v) => ({ value: v, label: label(v) }));
  const archivedView = params.status === "archived";

  return (
    <div className="space-y-3">
      {canWrite && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 p-2" role="region" aria-label="Bulk actions">
          <span className="px-1 text-sm font-medium">{selected.size} selected</span>
          {pick("priority", opts(PRIORITIES))}
          {pick("type", opts(TYPES))}
          {pick("automation", opts(AUTOMATION))}
          {pick("assign", [{ value: "__none", label: "Unassigned" }, ...members.map((m) => ({ value: m.id, label: m.name }))])}
          {archivedView
            ? <Button size="sm" variant="outline" disabled={pending} onClick={() => runBulk("restore")}>Restore</Button>
            : <Button size="sm" variant="outline" disabled={pending} onClick={() => setConfirmArchive(true)}>Archive</Button>}
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {canWrite && (
                <TableHead className="w-8">
                  <input type="checkbox" aria-label="Select all on page" checked={allSelected} onChange={toggleAll} />
                </TableHead>
              )}
              {SORTABLE.map(([col, text]) => (
                <TableHead key={col}>
                  <button type="button" className="inline-flex items-center gap-1 font-medium hover:text-foreground" onClick={() => sortBy(col)}>
                    {text}
                    {params.sort === col && (params.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                  </button>
                </TableHead>
              ))}
              <TableHead>Assignee</TableHead>
              <TableHead>Tags</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} data-state={selected.has(r.id) ? "selected" : undefined}>
                {canWrite && (
                  <TableCell>
                    <input type="checkbox" aria-label={`Select ${r.code}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                  </TableCell>
                )}
                <TableCell className="font-mono text-xs whitespace-nowrap">
                  <Link href={`/test-cases/${r.id}`} className="hover:underline">{r.code}</Link>
                </TableCell>
                <TableCell className="max-w-md">
                  <Link href={`/test-cases/${r.id}`} className="hover:underline">{r.title}</Link>
                  {r.archived_at ? <Badge variant="outline" className="ml-2">Archived</Badge> : null}
                </TableCell>
                <TableCell><Badge className={PRIORITY_TONE[r.priority]} variant="secondary">{label(r.priority)}</Badge></TableCell>
                <TableCell className="text-sm">{label(r.type)}</TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{r.updated_at.slice(0, 10)}</TableCell>
                <TableCell className="text-sm">{r.assignee_name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {r.tags.slice(0, 3).map((t) => <Badge key={t} variant="outline">{t}</Badge>)}
                    {r.tags.length > 3 && <span className="text-xs text-muted-foreground">+{r.tags.length - 3}</span>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Page {page} of {pages} · {total} total</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => go({ page: page - 1 })}><ChevronLeft /> Prev</Button>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => go({ page: page + 1 })}>Next <ChevronRight /></Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title={`Archive ${selected.size} test case(s)?`}
        description="Archived cases are hidden from the default list and cannot be edited until restored. Existing test runs are not affected."
        confirmLabel="Archive"
        onConfirm={() => runBulk("archive")}
      />
    </div>
  );
}
