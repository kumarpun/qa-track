import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ScrollText } from "lucide-react";
import { requireUserPage } from "@/lib/server/dal";
import { activeProjectCtx } from "@/lib/server/page";
import { listAuditLogs } from "@/lib/server/services/audit-log";
import { hasRole } from "@/lib/permissions";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(Date.parse(s))).optional().catch(undefined);
const filterSchema = z.object({
  action: z.string().trim().max(64).optional().catch(undefined),
  entityType: z.string().trim().max(64).optional().catch(undefined),
  from: day,
  to: day,
  page: z.coerce.number().int().min(1).max(10000).catch(1),
});
const fmt = (d) => new Date(d).toISOString().replace("T", " ").slice(0, 19) + " UTC";

export default async function AuditLogPage({ searchParams }) {
  const me = await requireUserPage();
  if (!hasRole(me.role, "QA_LEAD")) notFound();
  // Admins see everything; QA Leads see only the active project (and need audit.read there).
  let projectId = null;
  if (me.role !== "ADMIN") {
    const ctx = await activeProjectCtx("audit.read");
    if (!ctx) return <><PageHeader title="Audit Log" /><EmptyState icon={ScrollText} title="No project selected" description="Join a project to see its audit log." /></>;
    projectId = ctx.project.id;
  }
  const sp = await searchParams;
  const f = filterSchema.parse(Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])));
  const result = await listAuditLogs({ projectId, ...f });
  const href = (page) => {
    const qs = new URLSearchParams(Object.entries({ ...f, page }).filter(([, v]) => v).map(([k, v]) => [k, String(v)]));
    return `/audit-log?${qs}`;
  };
  const filtered = Boolean(f.action || f.entityType || f.from || f.to);

  return (
    <>
      <PageHeader
        title="Audit Log"
        description={`${result.total} ${result.total === 1 ? "entry" : "entries"}${projectId ? " in the active project" : " across all projects"}`}
      />
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2" aria-label="Audit filters">
        <Input name="action" aria-label="Action prefix" placeholder="Action, e.g. run." className="w-44" defaultValue={f.action ?? ""} />
        <NativeSelect name="entityType" aria-label="Entity type" className="w-auto min-w-32" defaultValue={f.entityType ?? ""}>
          <option value="">Any entity</option>
          {result.entityTypes.map((t) => <option key={t} value={t}>{t}</option>)}
        </NativeSelect>
        <Input type="date" name="from" aria-label="From date" className="w-40" defaultValue={f.from ?? ""} />
        <Input type="date" name="to" aria-label="To date" className="w-40" defaultValue={f.to ?? ""} />
        <Button type="submit" size="sm">Apply</Button>
        {filtered && <Link href="/audit-log" className={buttonVariants({ variant: "ghost", size: "sm" })}>Clear</Link>}
      </form>
      {result.rows.length === 0 ? (
        <EmptyState icon={ScrollText} title={filtered ? "No entries match your filters" : "No audit entries yet"} description="Important actions are recorded here as they happen." />
      ) : (
        <>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((r) => (
                  <TableRow key={r.id} data-testid="audit-row">
                    <TableCell className="whitespace-nowrap text-xs">{fmt(r.created_at)}</TableCell>
                    <TableCell className="text-sm">{r.user_name ?? <span className="text-muted-foreground">anonymous</span>}</TableCell>
                    <TableCell className="font-mono text-xs">{r.action}</TableCell>
                    <TableCell className="text-xs">{r.entity_type}{r.entity_id ? ` ${r.entity_id.slice(0, 8)}` : ""}</TableCell>
                    <TableCell className="max-w-xs truncate font-mono text-xs text-muted-foreground" title={r.metadata ? JSON.stringify(r.metadata) : undefined}>
                      {r.metadata ? JSON.stringify(r.metadata) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {result.pageCount > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Page {result.page} of {result.pageCount}</span>
              <div className="flex gap-2">
                {result.page > 1 && <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={href(result.page - 1)}>Previous</Link>}
                {result.page < result.pageCount && <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={href(result.page + 1)}>Next</Link>}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
