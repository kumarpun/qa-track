import Link from "next/link";
import { FolderKanban, Plus } from "lucide-react";
import { requireUserPage } from "@/lib/server/dal";
import { listProjects } from "@/lib/server/services/projects";
import { canCreateProject } from "@/lib/permissions";
import { PageHeader, EmptyState } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function ProjectsPage() {
  const user = await requireUserPage();
  const projects = await listProjects(user);
  const canCreate = canCreateProject(user.role);
  const newBtn = canCreate && <Button nativeButton={false} render={<Link href="/projects/new" />}><Plus /> New project</Button>;
  return (
    <>
      <PageHeader title="Projects" description="Projects isolate test cases, runs and defects." actions={newBtn} />
      {projects.length === 0 ? (
        <EmptyState icon={FolderKanban} title="No projects" description="You are not a member of any project yet." action={newBtn} />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead><TableHead>Name</TableHead><TableHead>Owner</TableHead>
                <TableHead className="text-right">Members</TableHead><TableHead className="text-right">Cases</TableHead>
                <TableHead className="text-right">Suites</TableHead><TableHead className="text-right">Runs</TableHead><TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono">{p.key}</TableCell>
                  <TableCell><Link href={`/projects/${p.id}`} className="font-medium hover:underline">{p.name}</Link></TableCell>
                  <TableCell>{p.owner_name}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.member_count}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.case_count}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.suite_count}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.run_count}</TableCell>
                  <TableCell><StatusBadge status={p.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
