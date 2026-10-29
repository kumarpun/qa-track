import { describe, expect, it } from "vitest";
import { decodeMentions, encodeMentions, mentionName, parseMentionIds, plainMentions } from "@/lib/mentions";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("mentions", () => {
  it("encodes only picked @Name occurrences", () => {
    const body = encodeMentions("hi @Ann Lee, see @Bob and email a@Bob.com @Zed", [{ id: A, name: "Ann Lee" }, { id: B, name: "Bob" }]);
    expect(body).toBe(`hi @[Ann Lee](${A}), see @[Bob](${B}) and email a@Bob.com @Zed`);
  });
  it("prefers the longer name and does not match inside a longer word", () => {
    const body = encodeMentions("@Anna and @Ann", [{ id: A, name: "Ann" }, { id: B, name: "Anna" }]);
    expect(body).toBe(`@[Anna](${B}) and @[Ann](${A})`);
  });
  it("round-trips through decode", () => {
    const stored = `ping @[Ann Lee](${A}) now`;
    const { text, mentions } = decodeMentions(stored);
    expect(text).toBe("ping @Ann Lee now");
    expect(mentions).toEqual([{ id: A, name: "Ann Lee" }]);
    expect(encodeMentions(text, mentions)).toBe(stored);
  });
  it("parses unique ids and flattens to plain text", () => {
    const stored = `@[Ann](${A}) @[Ann](${A}) @[Bob](${B})`;
    expect(parseMentionIds(stored)).toEqual([A, B]);
    expect(plainMentions(stored)).toBe("@Ann @Ann @Bob");
  });
  it("ignores malformed tokens and strips bracket characters from names", () => {
    expect(parseMentionIds("@[x](not-a-uuid) @[](")).toEqual([]);
    expect(mentionName("A[li](ce)")).toBe("Alice");
  });
});
