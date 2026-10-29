import Link from "next/link";
import { Layers, Plus } from "lucide-react";
import { activeProjectCtx } from "@/lib/server/page";
import { listSuites } from "@/lib/server/services/suites";
import { can } from "@/lib/permissions";
import { PageHeader, EmptyState } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button";
import { CASE_STATUS_LABELS } from "../test-cases/labels";
import { SuiteStatusSelect } from "./suite-status-select";

/** Depth-first flatten so nested suites render as indented rows. */
function flatten(byParent, parent = null, depth = 0) {
  return (byParent.get(parent) ?? []).flatMap((s) => [{ ...s, depth }, ...flatten(byParent, s.id, depth + 1)]);
}

export default async function TestSuitesPage() {
  const ctx = await activeProjectCtx();
  if (!ctx) return <><PageHeader title="Test Suites" /><EmptyState icon={Layers} title="No project selected" description="Create or join a project first." /></>;
  const canWrite = can(ctx.role, "suite.write");
  const canSetStatus = can(ctx.role, "testcase.write");
  const suites = await listSuites(ctx);
  const byParent = new Map();
  for (const s of suites) byParent.set(s.parent_id, [...(byParent.get(s.parent_id) ?? []), s]);

  return (
    <>
      <PageHeader
        title="Test Suites"
        description={`${suites.length} ${suites.length === 1 ? "suite" : "suites"} in ${ctx.project.key}`}
        actions={canWrite && <Link href="/test-suites/new" className={buttonVariants({ size: "sm" })}><Plus /> New suite</Link>}
      />
      {suites.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No test suites yet"
          description={canWrite ? "Group related test cases into a suite, then run it." : "Nothing has been added to this project yet."}
          action={canWrite ? <Link href="/test-suites/new" className={buttonVariants({ size: "sm" })}><Plus /> New suite</Link> : null}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table className="[&_td]:border-r [&_th]:border-r [&_td:last-child]:border-r-0 [&_th:last-child]:border-r-0">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="w-40">Results</TableHead>
                <TableHead className="w-24">Cases</TableHead>
                <TableHead>Feature</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {flatten(byParent).map((s) => (
                <TableRow key={s.id}>
                  <TableCell style={{ paddingLeft: `${0.75 + s.depth * 1.25}rem` }}>
                    <span className="inline-flex items-center gap-2">
                      <Layers className="size-4 text-muted-foreground" aria-hidden />
                      <Link href={`/test-suites/${s.id}`} className="font-medium hover:underline">{s.name}</Link>
                    </span>
                  </TableCell>
                  <TableCell className="p-0">
                    {canSetStatus
                      ? <SuiteStatusSelect projectId={ctx.project.id} suiteId={s.id} suiteName={s.name} status={s.status} caseCount={s.case_count} />
                      : <div className="px-2.5 py-2"><StatusBadge status={s.status} label={CASE_STATUS_LABELS[s.status]} /></div>}
                  </TableCell>
                  <TableCell className="text-sm">{s.case_count}</TableCell>
                  <TableCell className="text-sm">{s.feature ?? <span className="text-muted-foreground">—</span>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
