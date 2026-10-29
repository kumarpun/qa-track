import "server-only";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { requireUserPage, requireProject, getActiveProject, ACTIVE_COOKIE } from "./dal";

/**
 * Resolve the active project for a page and authorize it. Returns null when the user has no projects.
 * Auth failures (non-member, forbidden) render the 404 page so project ids cannot be probed.
 */
export async function activeProjectCtx(action = "project.read") {
  const user = await requireUserPage();
  // Start authorizing the cookie's project while the accessible-project list loads (saves one database round trip).
  const cookieId = (await cookies()).get(ACTIVE_COOKIE)?.value;
  const early = cookieId ? requireProject(cookieId, action).then((v) => ({ v }), (e) => ({ e })) : null;
  const active = await getActiveProject(user);
  if (!active) return null;
  try {
    const first = active.id === cookieId ? await early : null;
    if (first?.v) return first.v;
    if (first?.e) throw first.e;
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
