import { notFound } from "next/navigation";
import { requireUserPage } from "@/lib/server/dal";
import { listUsers } from "@/lib/server/services/users";
import { canManageUsers } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { UsersTable } from "./users-table";

export default async function UsersPage() {
  const me = await requireUserPage();
  if (!canManageUsers(me.role)) notFound();
  const users = await listUsers(me.org_id);
  return (
    <>
      <PageHeader title="Users & Settings" description="Manage accounts and global roles. Project access is managed per project." />
      <UsersTable meId={me.id} users={users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, active: !!u.active }))} />
    </>
  );
}
