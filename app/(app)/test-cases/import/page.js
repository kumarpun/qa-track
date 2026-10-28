import { notFound } from "next/navigation";
import { activeProjectCtx } from "@/lib/server/page";
import { PageHeader } from "@/components/page-header";
import { CSV_HEADERS } from "@/lib/testcase-csv";
import { ImportForm } from "./import-form";

export default async function ImportPage() {
  const ctx = await activeProjectCtx("testcase.write");
  if (!ctx) notFound();
  return (
    <>
      <PageHeader title="Import test cases" description={`Into project ${ctx.project.key}. The import is all-or-nothing: any invalid row blocks it.`} />
      <ImportForm projectId={ctx.project.id} headers={CSV_HEADERS} />
    </>
  );
}
