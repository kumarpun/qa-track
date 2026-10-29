import { describe, expect, it } from "vitest";
import { looseSource, parseCaseSteps, parseLine, sameUrl } from "@/lib/automation/parse-steps";

const cypressCase = [
  {
    action: "1. Visit: https://www.cypress.io/\n2. Text should present: AI writes the code. Cypress proves it works.\n3. Click login",
    expected: "Should naviagte to url: https://cloud.cypress.io/login?utm_medium=website&utm_source=cypress.io&utm_content=header",
  },
];

describe("parseCaseSteps", () => {
  it("parses a real-world case incl. the 'naviagte' typo", () => {
    const { instructions, unsupported } = parseCaseSteps(cypressCase);
    expect(unsupported).toEqual([]);
    expect(instructions.map((i) => i.kind)).toEqual(["goto", "seeText", "click", "urlIs"]);
    expect(instructions[0].url).toBe("https://www.cypress.io/");
    expect(instructions[1].text).toBe("AI writes the code. Cypress proves it works.");
    expect(instructions[2].target).toBe("login");
    expect(instructions[3].url).toBe("https://cloud.cypress.io/login?utm_medium=website&utm_source=cypress.io&utm_content=header");
  });

  it("reports every unrecognised line instead of guessing", () => {
    const { unsupported } = parseCaseSteps([{ action: "Visit https://a.test\nDrag the slider\nWiggle", expected: "Looks nice" }]);
    expect(unsupported.map((u) => u.line)).toEqual(["Drag the slider", "Wiggle", "Looks nice"]);
    expect(unsupported[2].section).toBe("Expected result");
  });

  it("flags a visit with a non-http url", () => {
    expect(parseCaseSteps([{ action: "Visit file:///etc/passwd", expected: "" }]).unsupported).toHaveLength(1);
    expect(parseCaseSteps([{ action: "Visit javascript:alert(1)", expected: "" }]).unsupported).toHaveLength(1);
  });

  it("handles several steps, empty expected and numbering styles", () => {
    const { instructions, unsupported } = parseCaseSteps([
      { action: "Open https://a.test", expected: "" },
      { action: "2) click on 'Sign in'", expected: "should see Welcome back" },
    ]);
    expect(unsupported).toEqual([]);
    expect(instructions.map((i) => i.kind)).toEqual(["goto", "click", "seeText"]);
    expect(instructions[1].target).toBe("Sign in");
  });

  it("no instructions for an empty case", () => {
    expect(parseCaseSteps([{ action: "", expected: "" }])).toEqual({ instructions: [], unsupported: [] });
  });
});

describe("parseLine", () => {
  it("parses type into field", () => {
    expect(parseLine('Type "bob@x.com" into Email')).toMatchObject({ kind: "type", value: "bob@x.com", field: "Email" });
    expect(parseLine("Enter hunter2 in the Password")).toMatchObject({ kind: "type", value: "hunter2", field: "Password" });
    expect(parseLine("3. Enter Email: kumar@tekkon.com.np")).toMatchObject({ kind: "type", field: "Email", value: "kumar@tekkon.com.np" });
    expect(parseLine("4. Enter password: Test@1234")).toMatchObject({ kind: "type", field: "password", value: "Test@1234" });
  });
  it("is case-insensitive and colon optional", () => {
    expect(parseLine("VISIT https://a.test")).toMatchObject({ kind: "goto" });
    expect(parseLine("go to: https://a.test")).toMatchObject({ kind: "goto" });
  });
});

describe("helpers", () => {
  it("looseSource lets 'login' match 'Log in'", () => {
    expect(new RegExp(looseSource("login"), "i").test("Log in")).toBe(true);
    expect(new RegExp(looseSource("a.b"), "i").test("axb")).toBe(false);
  });
  it("sameUrl ignores trailing slash and fragment but not query", () => {
    expect(sameUrl("https://a.test/x/", "https://a.test/x")).toBe(true);
    expect(sameUrl("https://a.test/x#top", "https://a.test/x")).toBe(true);
    expect(sameUrl("https://a.test/x?a=1", "https://a.test/x?a=2")).toBe(false);
  });
});

describe("negative-test grammar", () => {
  it("parses select-button, validation message and form-does-not-submit", () => {
    const { instructions, unsupported } = parseCaseSteps([
      {
        action: "1. Enter invalid email format: user@.com\n2. Enter valid password: abc123\n3. Select 'Sign Up' button",
        expected: "Validation message: 'Email address is badly formatted'; form does not submit",
      },
    ]);
    expect(unsupported).toEqual([]);
    expect(instructions.map((i) => i.kind)).toEqual(["type", "type", "click", "validation", "noSubmit"]);
    expect(instructions[2].target).toBe("Sign Up");
    expect(instructions[3].text).toBe("Email address is badly formatted");
  });

  it("does not treat 'Select X from Y' as a click and rejects half-parsed ';' lines", () => {
    expect(parseLine("Select Australia from Country")).toBeNull();
    expect(parseCaseSteps([{ action: "", expected: "Form does not submit; Looks pretty" }]).unsupported).toHaveLength(1);
  });
});

it("accepts 'Visit site:' style navigation", () => {
  expect(parseLine("1. Visit site: https://a.test/admin")).toMatchObject({ kind: "goto", url: "https://a.test/admin" });
  expect(parseLine("Open the page https://a.test")).toMatchObject({ kind: "goto", url: "https://a.test" });
});
