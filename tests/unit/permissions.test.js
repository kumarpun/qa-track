import { describe, it, expect } from "vitest";
import { can, hasRole, canCreateProject, canManageUsers, effectiveProjectRole, ACTION_MIN_ROLE } from "@/lib/permissions";

describe("role hierarchy", () => {
  it("orders Viewer < QA Engineer < QA Lead < Admin", () => {
    expect(hasRole("ADMIN", "QA_LEAD")).toBe(true);
    expect(hasRole("VIEWER", "QA_ENGINEER")).toBe(false);
    expect(hasRole(null, "VIEWER")).toBe(false);
  });
});

describe("permission matrix", () => {
  it("lets viewers read but never write", () => {
    expect(can("VIEWER", "project.read")).toBe(true);
    for (const action of Object.keys(ACTION_MIN_ROLE).filter((a) => ACTION_MIN_ROLE[a] !== "VIEWER"))
      expect(can("VIEWER", action)).toBe(false);
  });

  it("fails closed on unknown actions (typos must not grant access)", () => {
    expect(() => can("ADMIN", "does.not.exist")).toThrow(/Unknown action/);
  });

  it("restricts project creation and user admin", () => {
    expect(canCreateProject("QA_ENGINEER")).toBe(false);
    expect(canCreateProject("QA_LEAD")).toBe(true);
    expect(canManageUsers("QA_LEAD")).toBe(false);
    expect(canManageUsers("ADMIN")).toBe(true);
  });
});

describe("effectiveProjectRole", () => {
  it("gives non-members no access and admins full access", () => {
    expect(effectiveProjectRole("QA_LEAD", undefined)).toBeNull();
    expect(effectiveProjectRole("ADMIN", undefined)).toBe("ADMIN");
  });

  it("never lets a project membership exceed the global role", () => {
    expect(effectiveProjectRole("VIEWER", "QA_LEAD")).toBe("VIEWER");
  });
});
