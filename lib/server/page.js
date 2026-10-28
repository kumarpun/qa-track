import "server-only";
import { notFound } from "next/navigation";
import { requireUserPage, requireProject, getActiveProject } from "./dal";

/**
 * Resolve the active project for a page and authorize it. Returns null when the user has no projects.
 * Auth failures (non-member, forbidden) render the 404 page so project ids cannot be probed.
 */
export async function activeProjectCtx(action = "project.read") {
  const user = await requireUserPage();
  const active = await getActiveProject(user);
  if (!active) return null;
  try {
    return await requireProject(active.id, action);
  } catch (e) {
    if (e?.status) notFound();
    throw e;
  }
}

/** Authorize the project that owns a record (looked up by the caller) instead of the cookie project. */
export async function projectCtxById(projectId, action = "project.read") {
  await requireUserPage();
  try {
    return await requireProject(projectId, action);
  } catch (e) {
    if (e?.status) notFound();
    throw e;
  }
}
