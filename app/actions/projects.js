"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/lib/server/action";
import { projectSchema, projectUpdateSchema, memberSchema } from "@/lib/validation/project";
import * as projects from "@/lib/server/services/projects";
import { requireUser, requireProject, listAccessibleProjects, ACTIVE_COOKIE } from "@/lib/server/dal";
import { notFound } from "@/lib/server/errors";

const uuidSchema = z.string().uuid();

async function setActive(projectId) {
  (await cookies()).set(ACTIVE_COOKIE, projectId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
}

export async function createProjectAction(input) {
  return run(projectSchema, input, async (data) => {
    const user = await requireUser();
    const { id } = await projects.createProject(user, data);
    await setActive(id);
    revalidatePath("/", "layout");
    return { id };
  });
}

export async function updateProjectAction(projectId, input) {
  return run(projectUpdateSchema, input, async (data) => {
    const { user, project } = await requireProject(uuidSchema.parse(projectId), "project.manage");
    await projects.updateProject(user, project, data);
    revalidatePath("/", "layout");
  });
}

export async function switchProjectAction(projectId) {
  return run(uuidSchema, projectId, async (id) => {
    const user = await requireUser();
    const allowed = await listAccessibleProjects(user);
    if (!allowed.some((p) => p.id === id)) throw notFound("Project not found");
    await setActive(id);
    revalidatePath("/", "layout");
  });
}

export async function setMemberAction(projectId, input) {
  return run(memberSchema, input, async (data) => {
    const { user, project } = await requireProject(uuidSchema.parse(projectId), "project.manage");
    await projects.upsertMember(user, project, data);
    revalidatePath(`/projects/${project.id}`);
  });
}

export async function removeMemberAction(projectId, userId) {
  return run(null, null, async () => {
    const { user, project } = await requireProject(uuidSchema.parse(projectId), "project.manage");
    await projects.removeMember(user, project, uuidSchema.parse(userId));
    revalidatePath(`/projects/${project.id}`);
  });
}
