"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/lib/server/action";
import { userCreateSchema, userUpdateSchema } from "@/lib/validation/user";
import { createUser, updateUser } from "@/lib/server/services/users";
import { requireGlobalRole } from "@/lib/server/dal";

export async function createUserAction(input) {
  return run(userCreateSchema, input, async (data) => {
    const actor = await requireGlobalRole("ADMIN");
    await createUser(actor, data);
    revalidatePath("/users");
  });
}

export async function updateUserAction(id, input) {
  return run(userUpdateSchema, input, async (data) => {
    const actor = await requireGlobalRole("ADMIN");
    await updateUser(actor, z.string().uuid().parse(id), data);
    revalidatePath("/users");
  });
}
