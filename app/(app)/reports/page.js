import { requireUserPage } from "@/lib/server/dal";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Construction } from "lucide-react";

export default async function Page() {
  await requireUserPage();
  return (
    <>
      <PageHeader title="Reports" />
      <EmptyState icon={Construction} title="Coming in Phase 5" description="This module is planned in the build roadmap and not implemented yet." />
    </>
  );
}
