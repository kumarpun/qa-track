// Pure permission logic (no I/O) so it can be unit-tested and shared with the UI.
// The UI may use it to hide controls, but every mutation re-checks on the server via the DAL.
export const ROLES = ["VIEWER", "QA_ENGINEER", "QA_LEAD", "ADMIN"];
const RANK = Object.fromEntries(ROLES.map((r, i) => [r, i]));

export const ROLE_LABELS = {
  ADMIN: "Admin",
  QA_LEAD: "QA Lead",
  QA_ENGINEER: "QA Engineer",
  VIEWER: "Viewer",
};

/** Minimum effective project role required per action. */
export const ACTION_MIN_ROLE = {
  "project.read": "VIEWER",
  "report.read": "VIEWER",
  "testcase.write": "QA_ENGINEER",
  "suite.write": "QA_ENGINEER",
  "run.execute": "QA_ENGINEER",
  "defect.write": "QA_ENGINEER",
  "defect.delete": "QA_LEAD",
  "run.manage": "QA_LEAD",
  "project.manage": "QA_LEAD",
};

export const hasRole = (role, min) => role != null && RANK[role] >= RANK[min];

export function can(role, action) {
  const min = ACTION_MIN_ROLE[action];
  if (!min) throw new Error(`Unknown action: ${action}`);
  return hasRole(role, min);
}

/** Global capabilities (not tied to a project). */
export const canCreateProject = (globalRole) => hasRole(globalRole, "QA_LEAD");
export const canManageUsers = (globalRole) => globalRole === "ADMIN";

/**
 * Effective role in a project: admins act as ADMIN everywhere; others use their membership role,
 * and never exceed their global role (a global VIEWER stays read-only even if listed as QA_LEAD).
 */
export function effectiveProjectRole(globalRole, memberRole) {
  if (globalRole === "ADMIN") return "ADMIN";
  if (!memberRole) return null;
  return RANK[memberRole] <= RANK[globalRole] ? memberRole : globalRole;
}
