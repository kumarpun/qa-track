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

describe("full role × action matrix", () => {
  // Expected minimum role per action, written out independently of ACTION_MIN_ROLE so an accidental
  // relaxation of a rule fails here instead of silently passing.
  const EXPECTED = {
    "project.read": ["VIEWER", "QA_ENGINEER", "QA_LEAD", "ADMIN"],
    "report.read": ["VIEWER", "QA_ENGINEER", "QA_LEAD", "ADMIN"],
    "testcase.write": ["QA_ENGINEER", "QA_LEAD", "ADMIN"],
    "suite.write": ["QA_ENGINEER", "QA_LEAD", "ADMIN"],
    "run.execute": ["QA_ENGINEER", "QA_LEAD", "ADMIN"],
    "defect.write": ["QA_ENGINEER", "QA_LEAD", "ADMIN"],
    "defect.delete": ["QA_LEAD", "ADMIN"],
    "run.manage": ["QA_LEAD", "ADMIN"],
    "project.manage": ["QA_LEAD", "ADMIN"],
    "audit.read": ["QA_LEAD", "ADMIN"],
  };

  it("covers every defined action", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(Object.keys(ACTION_MIN_ROLE).sort());
  });

  for (const [action, allowed] of Object.entries(EXPECTED)) {
    for (const role of ["VIEWER", "QA_ENGINEER", "QA_LEAD", "ADMIN"]) {
      it(`${role} ${allowed.includes(role) ? "may" : "may not"} ${action}`, () => {
        expect(can(role, action)).toBe(allowed.includes(role));
      });
    }
  }

  it("denies a missing role everything", () => {
    for (const action of Object.keys(ACTION_MIN_ROLE)) expect(can(null, action)).toBe(false);
  });

  it("caps a project role at the global role", () => {
    expect(effectiveProjectRole("VIEWER", "QA_LEAD")).toBe("VIEWER");
    expect(effectiveProjectRole("QA_ENGINEER", "QA_LEAD")).toBe("QA_ENGINEER");
    expect(effectiveProjectRole("QA_LEAD", null)).toBe(null);
    expect(effectiveProjectRole("ADMIN", null)).toBe("ADMIN");
  });
});
