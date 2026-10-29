import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const dnsAnswers = { "rebind.example.com": [{ address: "127.0.0.1", family: 4 }], "mixed.example.com": [{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.9", family: 4 }], "ok.example.com": [{ address: "93.184.216.34", family: 4 }] };
vi.mock("node:dns/promises", () => ({ lookup: async (h) => { if (!dnsAnswers[h]) throw new Error("ENOTFOUND"); return dnsAnswers[h]; } }));
const { blockedReason, requestBlockedReason } = await import("@/lib/server/automation/url-guard");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("blockedReason", () => {
  it("allows public http(s) pages", () => {
    expect(blockedReason("https://www.cypress.io/")).toBeNull();
    expect(blockedReason("http://example.com/a?b=1")).toBeNull();
    expect(blockedReason("http://8.8.8.8/")).toBeNull();
  });

  it("blocks other schemes and credentials in the URL", () => {
    expect(blockedReason("file:///etc/passwd")).toMatch(/only http/);
    expect(blockedReason("ftp://example.com")).toMatch(/only http/);
    expect(blockedReason("javascript:alert(1)")).toMatch(/only http/);
    expect(blockedReason("https://user:pw@example.com")).toMatch(/credentials/);
    expect(blockedReason("not a url")).toMatch(/valid/);
  });

  it.each([
    "http://localhost:3000/", "http://app.localhost/", "http://127.0.0.1/", "http://127.1/", "http://2130706433/",
    "http://0x7f.0.0.1/", "http://[::1]/", "http://10.0.0.5/", "http://172.16.0.1/", "http://172.31.255.255/",
    "http://192.168.1.1/", "http://100.64.0.1/", "http://printer.local/", "http://db.internal/", "http://[::ffff:127.0.0.1]/",
    "http://[fd00::1]/",
  ])("blocks private target %s", (u) => {
    expect(blockedReason(u)).not.toBeNull();
  });

  it.each(["http://169.254.169.254/latest/meta-data/", "http://0.0.0.0/", "http://[fe80::1]/", "http://224.0.0.1/"])("always blocks metadata/link-local %s", (u) => {
    vi.stubEnv("BROWSER_RUNS_ALLOW_PRIVATE", "1");
    expect(blockedReason(u)).not.toBeNull();
  });

  it("does not treat public neighbours of private ranges as private", () => {
    expect(blockedReason("http://172.32.0.1/")).toBeNull();
    expect(blockedReason("http://100.128.0.1/")).toBeNull();
  });

  it("BROWSER_RUNS_ALLOW_PRIVATE re-allows loopback, but never the database host", () => {
    vi.stubEnv("BROWSER_RUNS_ALLOW_PRIVATE", "1");
    expect(blockedReason("http://localhost:3100/login")).toBeNull();
    expect(blockedReason("http://10.0.0.5/")).toBeNull();
    vi.stubEnv("DB_HOST", "gateway01.example-tidb.com");
    expect(blockedReason("https://gateway01.example-tidb.com:4000/")).toMatch(/database host/);
  });

  it("blocks the database host even when public", () => {
    vi.stubEnv("DB_HOST", "gateway01.example-tidb.com");
    expect(blockedReason("https://GATEWAY01.example-tidb.com/")).toMatch(/database host/);
  });
});

describe("requestBlockedReason", () => {
  it("lets data:/blob: through and blocks IP literals and redirect targets", async () => {
    expect(await requestBlockedReason("data:text/plain,hi")).toBeNull();
    expect(await requestBlockedReason("http://169.254.169.254/")).not.toBeNull();
    expect(await requestBlockedReason("http://127.0.0.1:4000/")).not.toBeNull();
  });

  it("blocks names that resolve to a private address, even if only one answer is private", async () => {
    expect(await requestBlockedReason("http://rebind.example.com/")).toMatch(/resolves/);
    expect(await requestBlockedReason("http://mixed.example.com/")).toMatch(/resolves/);
    expect(await requestBlockedReason("http://ok.example.com/")).toBeNull();
    expect(await requestBlockedReason("http://unresolvable.example.com/")).toBeNull(); // browser fails on its own
  });
});
