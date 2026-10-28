import { requireUserPage } from "@/lib/server/dal";
import { ROLE_LABELS } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { ProfileForms } from "./profile-forms";

export default async function ProfilePage() {
  const user = await requireUserPage();
  return (
    <>
      <PageHeader title="Profile" description={`${user.email} · ${ROLE_LABELS[user.role]}`} />
      <ProfileForms name={user.name} />
    </>
  );
}
