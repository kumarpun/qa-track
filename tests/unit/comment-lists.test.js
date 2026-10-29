import { describe, expect, it } from "vitest";
import { applyList, continueList, toggleCheck } from "@/components/comments/list-tools";

describe("applyList", () => {
  it("prefixes selected lines and numbers them", () => {
    expect(applyList("a\nb", 0, 3, "bullet").text).toBe("- a\n- b");
    expect(applyList("a\nb", 0, 3, "number").text).toBe("1. a\n2. b");
    expect(applyList("a", 0, 1, "check").text).toBe("- [ ] a");
  });
  it("toggles off when every line already is that list", () => {
    expect(applyList("- a\n- b", 0, 7, "bullet").text).toBe("a\nb");
  });
  it("converts between list kinds", () => {
    expect(applyList("- a", 0, 3, "number").text).toBe("1. a");
    expect(applyList("- [ ] a", 0, 7, "bullet").text).toBe("- a");
  });
});

describe("continueList", () => {
  it("continues bullets, numbers and checklists", () => {
    expect(continueList("- a", 3).text).toBe("- a\n- ");
    expect(continueList("1. a", 4).text).toBe("1. a\n2. ");
    expect(continueList("- [x] a", 7).text).toBe("- [x] a\n- [ ] ");
  });
  it("ends the list on an empty item", () => {
    expect(continueList("- a\n- ", 6)).toEqual({ text: "- a\n", pos: 4 });
  });
  it("ignores non-list lines and mid-line cursors", () => {
    expect(continueList("plain", 5)).toBeNull();
    expect(continueList("- abc", 3)).toBeNull();
  });
});

describe("toggleCheck", () => {
  it("flips only the nth checklist item", () => {
    const body = "intro\n- [ ] a\n- b\n- [x] c";
    expect(toggleCheck(body, 0)).toBe("intro\n- [x] a\n- b\n- [x] c");
    expect(toggleCheck(body, 1)).toBe("intro\n- [ ] a\n- b\n- [ ] c");
  });
});
