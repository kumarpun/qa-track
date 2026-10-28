import { requireUserPage } from "@/lib/server/dal";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Construction } from "lucide-react";

export default async function Page() {
  await requireUserPage();
  return (
    <>
      <PageHeader title="Test Cases" />
      <EmptyState icon={Construction} title="Coming in Phase 2" description="This module is planned in the build roadmap and not implemented yet." />
    </>
  );
}
