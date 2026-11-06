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
  it("parses select <field>: <value> as a dropdown choice, not a click", () => {
    expect(parseLine("8. select author: review@mailinator.com")).toMatchObject({ kind: "choose", field: "author", value: "review@mailinator.com" });
    expect(parseLine("Select button: Save")).toMatchObject({ kind: "click", target: "Save" });
    expect(parseLine("Select Groups from the sidenav")).toMatchObject({ kind: "click" });
  });

  it("parses upload <field>: <file> and rejects an upload with no file", () => {
    expect(parseLine("10. Upload Image: logo.png")).toMatchObject({ kind: "upload", field: "Image", value: "logo.png" });
    expect(parseLine("10. Upload Image:")).toBeNull();
  });

  it("parses checkbox of <row text>", () => {
    expect(parseLine("3. Click checkbox of Article blog from TestTrack")).toMatchObject({ kind: "check", target: "Article blog from TestTrack" });
    expect(parseLine("Tick the checkbox next to Foo")).toMatchObject({ kind: "check", target: "Foo" });
    expect(parseLine("Click Save")).toMatchObject({ kind: "click" });
  });

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

describe("click targets with a region", () => {
  it("splits 'Click Groups in sidenav' into label + region", () => {
    expect(parseLine("Click Groups in sidenav")).toMatchObject({ kind: "click", target: "Groups", scope: "nav" });
    expect(parseLine("1. Click on the 'Groups' link in the side nav")).toMatchObject({ target: "Groups", scope: "nav" });
    expect(parseLine("Press Save button in the header")).toMatchObject({ target: "Save", scope: "header" });
    expect(parseLine("Click Groups from sidebar")).toMatchObject({ target: "Groups", scope: "nav" });
    expect(parseLine("Click Privacy on footer")).toMatchObject({ target: "Privacy", scope: "footer" });
    expect(parseLine("Click Auditor in table")).toMatchObject({ target: "Auditor", scope: "content" });
    expect(parseLine("Click Auditor in the main content")).toMatchObject({ target: "Auditor", scope: "content" });
  });

  it("leaves plain clicks unscoped and still rejects 'Select X from Y'", () => {
    expect(parseLine("Click login")).toEqual({ kind: "click", target: "login", source: "Click login" });
    expect(parseLine("Click Sign in button")).toMatchObject({ target: "Sign in" });
    expect(parseLine("Select Australia from Country")).toBeNull();
  });
});

describe("call instruction", () => {
  it("parses a call by title or code, with optional quotes and case keyword", () => {
    expect(parseLine("Call Willow admin login")).toMatchObject({ kind: "call", ref: "Willow admin login" });
    expect(parseLine("2. Run test case: TC-WILLOW-0091")).toMatchObject({ kind: "call", ref: "TC-WILLOW-0091" });
    expect(parseLine('Include "Willow admin login"')).toMatchObject({ kind: "call", ref: "Willow admin login" });
  });
  it("keeps call lines in action order and does not shadow other rules", () => {
    const { instructions, unsupported } = parseCaseSteps([{ action: "Call Login\nClick Save button", expected: "Should see Done" }]);
    expect(unsupported).toEqual([]);
    expect(instructions.map((i) => i.kind)).toEqual(["call", "click", "seeText"]);
  });
});

describe("multi-line step values", () => {
  const long = "1. Visit site: https://a.test/admin/\n2. Enter content: First up – What’s ‘soil drainage’?\n\nIt’s a bit of a buzzword.\nSoil drainage describes how well water travels.\n3. Click Save";

  it("keeps unnumbered lines and blank lines with the step above", () => {
    const { instructions, unsupported } = parseCaseSteps([{ action: long, expected: "" }]);
    expect(unsupported).toEqual([]);
    expect(instructions.map((i) => i.kind)).toEqual(["goto", "type", "click"]);
    expect(instructions[1].field).toBe("content");
    expect(instructions[1].value).toBe("First up – What’s ‘soil drainage’?\n\nIt’s a bit of a buzzword.\nSoil drainage describes how well water travels.");
  });
});

describe("'<label> display: <text>' assertions", () => {
  it("accepts display/shown/appears and drops a repeated label", () => {
    const { instructions, unsupported } = parseCaseSteps([
      { action: "Visit https://a.test", expected: "Title display: title: Article blog from TestTrack\nSuccess message displayed: The article was added successfully\nBanner shown: Welcome" },
    ]);
    expect(unsupported).toEqual([]);
    expect(instructions.slice(1).map((i) => [i.kind, i.text])).toEqual([
      ["seeText", "Article blog from TestTrack"],
      ["seeText", "The article was added successfully"],
      ["seeText", "Welcome"],
    ]);
  });
  it("does not swallow other instructions", () => {
    expect(parseLine("Click Display: settings")).toMatchObject({ kind: "click" });
  });
});

describe("click with a kind word and colon", () => {
  it("drops 'button:' / 'link:' before the label", () => {
    expect(parseLine("3. Click button: Add article")).toMatchObject({ kind: "click", target: "Add article" });
    expect(parseLine("Click link: 'Sign in'")).toMatchObject({ kind: "click", target: "Sign in" });
    expect(parseLine("Click Save button in the header")).toMatchObject({ target: "Save", scope: "header" });
  });
});

describe("fenced long values", () => {
  const text = '1. Visit https://x.com\n2. Enter En content: """\nPara one\nline two\n\nPara two\n"""\n3. Click Save';
  it("keeps a fenced value with blank lines as one step", async () => {
    const { stepBlocks } = await import("@/lib/automation/parse-steps");
    expect(stepBlocks(text)).toHaveLength(3);
  });
  it("types the text between the fences", async () => {
    const { parseCaseSteps } = await import("@/lib/automation/parse-steps");
    const { instructions, unsupported } = parseCaseSteps([{ action: text, expected: "" }]);
    expect(unsupported).toEqual([]);
    expect(instructions[1]).toMatchObject({ kind: "type", field: "En content", value: "Para one\nline two\n\nPara two" });
  });
  it("fences work without numbering", async () => {
    const { stepBlocks } = await import("@/lib/automation/parse-steps");
    expect(stepBlocks('Enter body: """\na\n\nb\n"""\nClick Save')).toHaveLength(2);
  });
});

describe("scroll", () => {
  it("parses scroll steps", async () => {
    const { parseLine } = await import("@/lib/automation/parse-steps");
    expect(parseLine("6. Scroll to En summary")).toMatchObject({ kind: "scroll", target: "En summary" });
    expect(parseLine("Scroll down to the footer")).toMatchObject({ kind: "scroll", target: "footer" });
    expect(parseLine("Scroll to bottom")).toMatchObject({ kind: "scroll", target: "bottom" });
  });
});

describe("text absent", () => {
  it("parses 'should not be present' as notText", async () => {
    const { parseLine } = await import("@/lib/automation/parse-steps");
    expect(parseLine("Text should not be present: Select base blog to change")).toMatchObject({ kind: "notText", text: "Select base blog to change" });
    expect(parseLine("Should not see: Foo")).toMatchObject({ kind: "notText", text: "Foo" });
    expect(parseLine("Text should be present: Foo")).toMatchObject({ kind: "seeText", text: "Foo" });
  });
});
