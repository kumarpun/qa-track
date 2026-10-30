import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const cases = {
  login: { id: "1", code: "TC-W-1", title: "Login", steps: [{ action: "Visit https://example.com/admin\nEnter username: u", expected: "Should see Admin" }] },
  loop: { id: "2", code: "TC-W-2", title: "Loop", steps: [{ action: "Call Loop", expected: "" }] },
};
vi.mock("@/lib/server/services/testcases", () => ({
  getCase: vi.fn(),
  recordAutoRun: vi.fn(),
  findCaseByRef: vi.fn(async (_c, ref) => {
    const hit = Object.values(cases).find((c) => c.title.toLowerCase() === ref.toLowerCase() || c.code === ref);
    if (!hit) throw new Error(`not found ${ref}`);
    return hit;
  }),
}));
vi.mock("@/lib/server/services/executions", () => ({ getRunCase: vi.fn(), recordExecution: vi.fn() }));
vi.mock("@/lib/server/automation/browser-runner", () => ({ runInBrowser: vi.fn(async (ins) => ({ status: "PASSED", log: [], ins })) }));
vi.mock("@/lib/server/automation/storage", () => ({ saveShot: vi.fn() }));
vi.mock("@/lib/server/automation/config", () => ({ browserRunsEnabled: () => true }));

const { getCase } = await import("@/lib/server/services/testcases");
const { runInBrowser } = await import("@/lib/server/automation/browser-runner");
const { runCaseInBrowser } = await import("@/lib/server/services/automation");
const ctx = { project: { id: "p" } };

describe("Call <case> expansion", () => {
  it("inlines the called case's steps in place, tagged with its code", async () => {
    getCase.mockResolvedValue({ id: "9", code: "TC-W-9", steps: [{ action: "Call Login\nClick Save button", expected: "" }] });
    await runCaseInBrowser(ctx, "9");
    const ins = runInBrowser.mock.calls.at(-1)[0];
    expect(ins.map((i) => i.kind)).toEqual(["goto", "type", "seeText", "click"]);
    expect(ins[0].source).toMatch(/^\[TC-W-1\] /);
  });
  it("rejects a case that calls itself", async () => {
    getCase.mockResolvedValue({ id: "2", code: "TC-W-2", steps: cases.loop.steps });
    await expect(runCaseInBrowser(ctx, "2")).rejects.toThrow(/recursively/);
  });
  it("rejects an unknown case", async () => {
    getCase.mockResolvedValue({ id: "9", code: "TC-W-9", steps: [{ action: "Call Nope", expected: "" }] });
    await expect(runCaseInBrowser(ctx, "9")).rejects.toThrow(/not found/);
  });
});
