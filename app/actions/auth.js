"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { run } from "@/lib/server/action";
import { loginSchema, signupSchema, profileSchema, changePasswordSchema } from "@/lib/validation/auth";
import { authenticate, changePassword, signUp } from "@/lib/server/services/auth";
import { updateProfile } from "@/lib/server/services/users";
import { createSession, destroySession } from "@/lib/server/session";
import { requireUser, ACTIVE_COOKIE } from "@/lib/server/dal";

export async function loginAction(input) {
  return run(loginSchema, input, async ({ email, password }) => {
    const userId = await authenticate(email, password);
    await createSession(userId);
  });
}

export async function signupAction(input) {
  return run(signupSchema, input, async (values) => {
    const userId = await signUp(values);
    await createSession(userId);
  });
}

export async function logoutAction() {
  const u = await requireUser().catch(() => null);
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
