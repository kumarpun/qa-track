"use client";
import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Loader2, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PRIORITIES, TYPES, AUTOMATION, CASE_STATUSES } from "@/lib/validation/testcase";
import { bulkAction, fillCaseStatusAction } from "@/app/actions/testcases";
import { runCaseInBrowser } from "@/lib/client/browser-run";
import { BrowserRunOptions, useBrowserOptions } from "@/components/browser-run-options";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClickableRow } from "@/components/clickable-row";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeSelect } from "@/components/native-select";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { StatusBadge } from "@/components/status-badge";
import { StatusSelect } from "./[id]/status-select";
import { label, CASE_STATUS_LABELS, PRIORITY_TONE } from "./labels";

const SORTABLE = [
  ["title", "Title"],
  ["priority", "Priority"],
  ["type", "Type"],
  ["updated_at", "Updated"],
  ["suite", "Test suites"],
];

export function CaseList({ projectId, rows, page, pages, total, params, canWrite, canRunBrowser, members }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [selected, setSelected] = useState(() => new Set());
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [browserOpts, updateBrowserOpts] = useBrowserOptions();
  const [active, setActive] = useState(null); // { key, done, total }
  const [running, startRun] = useTransition();

  /** Runs the given cases in the browser one after another (one run at a time). */
  const runInBrowser = (key, ids) =>
    startRun(async () => {
      let passed = 0;
      const problems = [];
      for (const [i, id] of ids.entries()) {
        setActive({ key, done: i, total: ids.length });
        const res = await runCaseInBrowser(projectId, id, browserOpts);
        if (!res.ok) problems.push(res.error);
        else if (res.data.status === "PASSED") passed++;
        else problems.push(res.data.failedAt ?? "failed");
      }
      setActive(null);
      const failed = ids.length - passed;
      if (failed === 0) toast.success(ids.length === 1 ? "Case passed." : `All ${passed} cases passed.`);
      else toast.error(`${passed} of ${ids.length} passed. ${failed} not passed: ${problems.slice(0, 2).join(" | ")}`);
      router.refresh();
    });

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
        toast.success(`${op === "delete" ? "Deleted" : "Updated"} ${res.data?.affected ?? 0} of ${selected.size} test case(s)`);
        setSelected(new Set());
        router.refresh();
      } else toast.error(res.error);
    });

  const setResult = (status) =>
    startTransition(async () => {
      const res = await fillCaseStatusAction(projectId, [...selected], status);
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

  return (
    <div className="space-y-3">
      {canWrite && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 p-2" role="region" aria-label="Bulk actions">
          <span className="px-1 text-sm font-medium">{selected.size} selected</span>
          <NativeSelect aria-label="Set result" className="w-auto" value="" disabled={pending} onChange={(e) => e.target.value && setResult(e.target.value)}>
            <option value="">Set result…</option>
            {CASE_STATUSES.map((v) => <option key={v} value={v}>{CASE_STATUS_LABELS[v]}</option>)}
          </NativeSelect>
          {pick("priority", opts(PRIORITIES))}
          {pick("type", opts(TYPES))}
          {pick("automation", opts(AUTOMATION))}
          {pick("assign", [{ value: "__none", label: "Unassigned" }, ...members.map((m) => ({ value: m.id, label: m.name }))])}
          {canRunBrowser && (
            <Button size="sm" variant="outline" disabled={pending || running} onClick={() => runInBrowser("selected", [...selected])}>
              {active?.key === "selected" ? <Loader2 className="animate-spin" /> : <Play />}
              {active?.key === "selected" ? `Running ${active.done + 1}/${active.total}…` : "Run selected in browser"}
            </Button>
          )}
          <Button size="icon-sm" variant="outline" aria-label="Delete selected" title="Delete selected" disabled={pending} onClick={() => setConfirmDelete(true)}>
            <Trash2 className="text-destructive" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      {canRunBrowser && (
        <div className="flex items-center justify-end gap-2">
          <BrowserRunOptions opts={browserOpts} update={updateBrowserOpts} disabled={running} />
          <Button variant="outline" size="sm" disabled={running || rows.length === 0} onClick={() => runInBrowser("all", rows.map((r) => r.id))}>
            {active?.key === "all" ? <Loader2 className="animate-spin" /> : <Play />}
            {active?.key === "all" ? `Running ${active.done + 1}/${active.total}…` : "Run all in browser"}
          </Button>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border">
        <Table className="[&_td]:border-r [&_th]:border-r [&_td:last-child]:border-r-0 [&_th:last-child]:border-r-0">
          <TableHeader>
            <TableRow>
              {canWrite && (
                <TableHead className="w-8">
                  <input type="checkbox" aria-label="Select all on page" checked={allSelected} onChange={toggleAll} />
                </TableHead>
              )}
              {SORTABLE.map(([col, text]) => (
                <Fragment key={col}>
                <TableHead>
                  <button type="button" className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wider hover:text-foreground" onClick={() => sortBy(col)}>
                    {text}
                    {params.sort === col && (params.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                  </button>
                </TableHead>
                {col === "title" && <TableHead className="w-40">Results</TableHead>}
                </Fragment>
              ))}
              {canRunBrowser && <TableHead className="w-10"><span className="sr-only">Run in browser</span></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <ClickableRow key={r.id} href={`/test-cases/${r.id}`} data-state={selected.has(r.id) ? "selected" : undefined}>
                {canWrite && (
                  <TableCell>
                    <input type="checkbox" aria-label={`Select ${r.code}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                  </TableCell>
                )}
                <TableCell className="max-w-md">
                  <Link href={`/test-cases/${r.id}`} className="hover:underline">{r.title}</Link>
                </TableCell>
                <TableCell className="p-0">
                  {canWrite
                    ? <StatusSelect projectId={projectId} caseId={r.id} status={r.status} filled fillGroup="cases" ariaLabel={`Result for ${r.code}`} />
                    : <div className="px-2.5 py-2"><StatusBadge status={r.status} label={CASE_STATUS_LABELS[r.status]} /></div>}
                </TableCell>
                <TableCell><Badge className={PRIORITY_TONE[r.priority]} variant="secondary">{label(r.priority)}</Badge></TableCell>
                <TableCell className="text-sm">{label(r.type)}</TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{r.updated_at.slice(0, 10)}</TableCell>
                <TableCell className="text-sm">
                  {r.suites.length ? r.suites.join(", ") : <span className="text-muted-foreground">—</span>}
                </TableCell>
                {canRunBrowser && (
                  <TableCell className="p-0">
                    <Button variant="ghost" size="icon-sm" disabled={running}
                      aria-label={`Run ${r.code} in browser`}
                      title={active?.key === r.id ? "Running…" : "Run in browser"}
                      onClick={() => runInBrowser(r.id, [r.id])}>
                      {active?.key === r.id ? <Loader2 className="animate-spin" /> : <Play />}
                    </Button>
                  </TableCell>
                )}
              </ClickableRow>
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
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${selected.size} test case(s) permanently?`}
        description="This cannot be undone. The selected test cases, their steps and suite membership are removed from the database. If any of them is in a test run that is not completed, nothing is deleted."
        confirmLabel="Delete"
        onConfirm={() => runBulk("delete")}
      />
    </div>
  );
}
