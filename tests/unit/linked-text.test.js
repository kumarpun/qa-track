import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LinkedText } from "@/app/(app)/test-cases/linked-text.jsx";

const cases = [
  { id: "a1", code: "TC-W-1", title: "Willow admin login" },
  { id: "a2", code: "TC-W-2", title: "Dup" },
  { id: "a3", code: "TC-W-3", title: "Dup" },
];
const html = (text) => renderToStaticMarkup(createElement(LinkedText, { cases }, text));

describe("LinkedText", () => {
  it("renders a Call line as a blue link to the called case, keeping the number and other lines", () => {
    const out = html("1. Call Willow admin login\n2. Click Save button");
    expect(out).toContain('href="/test-cases/a1"');
    expect(out).toContain("text-blue-600");
    expect(out).toContain("1. Call ");
    expect(out).toContain("2. Click Save button");
  });
  it("resolves by code, but leaves unknown and ambiguous titles as plain text", () => {
    expect(html("Call TC-W-1")).toContain('href="/test-cases/a1"');
    expect(html("Call Dup")).not.toContain("<a");
    expect(html("Call Nope")).not.toContain("<a");
  });
});

describe("LinkedText multi-line steps", () => {
  it("shows extra lines under their step instead of as loose paragraphs", () => {
    const out = html("1. Enter content: Intro\n\nSecond paragraph\n2. Click Save");
    expect(out.match(/data-testid="step-line"/g)).toHaveLength(2);
    expect(out).toContain('data-testid="step-more"');
    expect(out).toContain("Second paragraph");
  });

  it("collapses a multi-line step to its first line with a See more toggle", () => {
    const out = html("1. Enter content: Intro\n\nSecond paragraph");
    expect(out).toContain("See more");
    expect(out).toMatch(/data-testid="step-more"[^>]*>Second paragraph/);
    expect(out).toMatch(/<p hidden=""[^>]*data-testid="step-more"/);
    expect(html("1. Click Save")).not.toContain("See more");
  });
});

describe("LinkedText fenced long values", () => {
  it("hides the fences and collapses to the first content line", () => {
    const out = html('1. Enter content: """\nFirst para\n\nSecond para\n"""\n2. Click Save');
    expect(out).toContain("1. Enter content: First para");
    expect(out).toContain("See more");
    expect(out).toContain("Second para");
    expect(out).not.toContain('"""');
    expect(out).toContain("2. Click Save");
  });
});
