import { describe, it, expect } from "vitest";
import { signupSchema } from "@/lib/validation/auth";

const ok = { companyName: " Acme ", name: "Ann", email: "ANN@Acme.com ", password: "Passw0rd1", confirmPassword: "Passw0rd1" };

describe("signupSchema", () => {
  it("trims and lowercases", () => {
    const v = signupSchema.parse(ok);
    expect(v.companyName).toBe("Acme");
    expect(v.email).toBe("ann@acme.com");
  });
  it("rejects blank company, weak or mismatched password", () => {
    expect(signupSchema.safeParse({ ...ok, companyName: "  " }).success).toBe(false);
    expect(signupSchema.safeParse({ ...ok, password: "short1", confirmPassword: "short1" }).success).toBe(false);
    expect(signupSchema.safeParse({ ...ok, confirmPassword: "Passw0rd2" }).success).toBe(false);
  });
});
