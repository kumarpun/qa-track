"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { run } from "@/lib/server/action";
import { loginSchema, profileSchema, changePasswordSchema } from "@/lib/validation/auth";
import { authenticate, changePassword } from "@/lib/server/services/auth";
import { updateProfile } from "@/lib/server/services/users";
import { createSession, destroySession } from "@/lib/server/session";
import { requireUser, ACTIVE_COOKIE } from "@/lib/server/dal";
import { audit } from "@/lib/server/audit";

export async function loginAction(input) {
  return run(loginSchema, input, async ({ email, password }) => {
    const userId = await authenticate(email, password);
    await createSession(userId);
  });
}

export async function logoutAction() {
  const u = await requireUser().catch(() => null);
  if (u) await audit({ userId: u.id, action: "auth.logout", entityType: "user", entityId: u.id });
  await destroySession();
  (await cookies()).delete(ACTIVE_COOKIE);
}

export async function updateProfileAction(input) {
  return run(profileSchema, input, async ({ name }) => {
    const u = await requireUser();
    await updateProfile(u.id, name);
    revalidatePath("/", "layout");
  });
}

export async function changePasswordAction(input) {
  return run(changePasswordSchema, input, async ({ currentPassword, newPassword }) => {
    const u = await requireUser();
    await changePassword(u.id, currentPassword, newPassword);
  });
}
