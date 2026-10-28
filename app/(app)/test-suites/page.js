import Link from "next/link";
import { Layers, Plus } from "lucide-react";
import { activeProjectCtx } from "@/lib/server/page";
import { listSuites } from "@/lib/server/services/suites";
import { can } from "@/lib/permissions";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function Tree({ nodes, byParent, depth = 0 }) {
  return (
    <ul className={depth ? "ml-5 border-l pl-3" : ""}>
      {nodes.map((s) => (
        <li key={s.id} className="py-1">
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-muted-foreground" aria-hidden />
            <Link href={`/test-suites/${s.id}`} className="text-sm font-medium hover:underline">{s.name}</Link>
            <Badge variant="secondary">{s.case_count} {s.case_count === 1 ? "case" : "cases"}</Badge>
            {s.feature && <span className="text-xs text-muted-foreground">{s.feature}</span>}
          </div>
          {byParent.get(s.id)?.length > 0 && <Tree nodes={byParent.get(s.id)} byParent={byParent} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  );
}

export default async function TestSuitesPage() {
  const ctx = await activeProjectCtx();
  if (!ctx) return <><PageHeader title="Test Suites" /><EmptyState icon={Layers} title="No project selected" description="Create or join a project first." /></>;
  const canWrite = can(ctx.role, "suite.write");
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
        <Card><CardContent className="pt-6"><Tree nodes={byParent.get(null) ?? []} byParent={byParent} /></CardContent></Card>
      )}
    </>
  );
}
