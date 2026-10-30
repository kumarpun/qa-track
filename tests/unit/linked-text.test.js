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
