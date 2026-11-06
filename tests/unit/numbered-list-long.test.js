import { describe, expect, it } from "vitest";
import { emptyEnterStepAt } from "@/lib/numbered-list";

describe("emptyEnterStepAt", () => {
  const t = "4. Enter Title: Hi\n5. Enter En content:\n6. Click Save";
  it("finds an empty Enter step on the caret line", () => {
    const caret = t.indexOf("content") + 3;
    expect(emptyEnterStepAt(t, caret)).toMatchObject({ head: "5. Enter En content:", start: t.indexOf("5."), end: t.indexOf("\n6.") });
  });
  it("caret at end of that line works; filled or other steps give null", () => {
    expect(emptyEnterStepAt(t, t.indexOf("\n6."))?.head).toBe("5. Enter En content:");
    expect(emptyEnterStepAt(t, 3)).toBeNull();
    expect(emptyEnterStepAt(t, t.length)).toBeNull();
  });
});
