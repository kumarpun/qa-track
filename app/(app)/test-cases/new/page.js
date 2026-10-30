import { notFound } from "next/navigation";
import { z } from "zod";
import { activeProjectCtx } from "@/lib/server/page";
import { listMembers } from "@/lib/server/services/projects";
import { listCaseOptions } from "@/lib/server/services/testcases";
import { getSuite } from "@/lib/server/services/suites";
import { CaseForm } from "../case-form";

export default async function NewTestCasePage({ searchParams }) {
  const ctx = await activeProjectCtx("testcase.write");
  if (!ctx) notFound();
  // ?suite=<id>: the new case is added to that suite on save (ignored if it is not an active suite of this project).
  const { suite: suiteParam } = await searchParams;
  let suite = null;
  if (z.string().uuid().safeParse(suiteParam).success) {
    const s = await getSuite(ctx, suiteParam).catch(() => null);
    if (s && !s.archived_at) suite = { id: s.id, name: s.name };
  }
  const [members, linkable] = await Promise.all([listMembers(ctx.project.id), listCaseOptions(ctx)]);
  return (
    <CaseForm projectId={ctx.project.id} suite={suite} linkable={linkable} members={members.filter((m) => m.active).map((m) => ({ id: m.user_id, name: m.name }))} />
  );
}
