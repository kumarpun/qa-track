import Link from "next/link";
import { FileCheck2, Layers, PlayCircle, Bug, CheckCircle2, Percent, FolderKanban } from "lucide-react";
import { requireUserPage, getActiveProject } from "@/lib/server/dal";
import { getDashboard } from "@/lib/server/services/dashboard";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { canCreateProject } from "@/lib/permissions";
import { StatusChart, TrendChart } from "./dashboard-charts";

function Stat({ href, label, value, sub, icon: Icon }) {
  return (
    <Link href={href} className="group block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Card className="transition-colors group-hover:bg-accent/40">
        <CardContent className="flex items-start justify-between pt-6">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
            {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
          </div>
          <Icon className="size-5 text-muted-foreground" aria-hidden />
        </CardContent>
      </Card>
    </Link>
  );
}

export default async function DashboardPage() {
  const user = await requireUserPage();
  const project = await getActiveProject(user);
  if (!project) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description={canCreateProject(user.role) ? "Create your first project to start managing test cases." : "Ask an Admin or QA Lead to add you to a project."}
          action={canCreateProject(user.role) && <Button nativeButton={false} render={<Link href="/projects/new" />}>Create project</Button>}
        />
      </>
    );
  }
  const d = await getDashboard(project.id);
  const p = d.progress;
  const chartData = [
    { status: "PASSED", value: p.PASSED }, { status: "FAILED", value: p.FAILED },
    { status: "BLOCKED", value: p.BLOCKED }, { status: "SKIPPED", value: p.SKIPPED },
    { status: "RETEST", value: p.RETEST }, { status: "NOT_RUN", value: p.NOT_RUN },
  ];
  return (
    <>
      <PageHeader title="Dashboard" description={`${project.key} · ${project.name}`} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat href="/test-cases" label="Test cases" value={d.totalCases} icon={FileCheck2} />
        <Stat href="/test-suites" label="Test suites" value={d.totalSuites} icon={Layers} />
        <Stat href="/test-runs" label="Test runs" value={d.totalRuns} sub={`${d.runCounts.IN_PROGRESS ?? 0} in progress`} icon={PlayCircle} />
        <Stat href="/defects" label="Open defects" value={d.openDefects} sub={`${Object.values(d.defects).reduce((a, b) => a + b, 0)} total`} icon={Bug} />
        <Stat href="/test-runs" label="Executed" value={`${p.completed} / ${p.total}`} sub={`${p.progressPct}% complete`} icon={CheckCircle2} />
        <Stat href="/reports" label="Pass rate" value={`${p.passRate}%`} sub={`${p.executedPassRate}% of executed`} icon={Percent} />
        <Stat href="/test-runs" label="Failed" value={p.FAILED} icon={Bug} />
        <Stat href="/test-runs" label="Blocked / Retest" value={`${p.BLOCKED} / ${p.RETEST}`} icon={PlayCircle} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Execution status</CardTitle></CardHeader>
          <CardContent>
            {p.total ? <StatusChart data={chartData} /> : <p className="py-10 text-center text-sm text-muted-foreground">No executions yet. Create a test run to begin.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Pass rate trend (30 days)</CardTitle></CardHeader>
          <CardContent>
            {d.trend.length ? <TrendChart data={d.trend} /> : <p className="py-10 text-center text-sm text-muted-foreground">No run data in the last 30 days.</p>}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle className="text-base">Recent test runs</CardTitle></CardHeader>
        <CardContent>
          {d.recentRuns.length ? (
            <ul className="divide-y">
              {d.recentRuns.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <Link href={`/test-runs/${r.id}`} className="min-w-0 truncate hover:underline">
                    <span className="font-mono text-xs text-muted-foreground">{r.code}</span> {r.name}
                  </Link>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="tabular-nums text-muted-foreground">{r.progress.progressPct}%</span>
                    <StatusBadge status={r.status} />
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="py-6 text-center text-sm text-muted-foreground">No test runs yet.</p>}
        </CardContent>
      </Card>
    </>
  );
}
