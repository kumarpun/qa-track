import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Browser runs visit URLs written in test cases, so the browser must never be pointed at this server's own
 * network: localhost, private ranges, cloud metadata or the database host. Blocked by default;
 * BROWSER_RUNS_ALLOW_PRIVATE=1 re-allows loopback/private targets (for testing local sites) but never
 * link-local/metadata addresses or the database host.
 */
const allowPrivate = () => process.env.BROWSER_RUNS_ALLOW_PRIVATE === "1";

const v4 = (ip) => ip.split(".").map(Number);

/** "metadata" = always blocked; "private" = blocked unless BROWSER_RUNS_ALLOW_PRIVATE=1; null = public. */
function classifyV4(ip) {
  const [a, b] = v4(ip);
  if (a === 169 && b === 254) return "metadata"; // link-local incl. 169.254.169.254
  if (a === 0) return "metadata"; // "this network" / 0.0.0.0
  if (a >= 224) return "metadata"; // multicast + reserved + broadcast
  if (a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return "private";
  return null;
}

function classifyV6(ip) {
  const s = ip.toLowerCase();
  const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped
  if (mapped) return classifyV4(mapped[1]);
  if (s === "::" || s.startsWith("fe8") || s.startsWith("fe9") || s.startsWith("fea") || s.startsWith("feb")) return "metadata"; // unspecified, link-local
  if (s === "::1" || s.startsWith("fc") || s.startsWith("fd")) return "private"; // loopback, unique-local
  if (s.startsWith("::ffff:")) return "metadata"; // other mapped forms: refuse rather than parse
  return null;
}

function classifyIp(ip) {
  const kind = isIP(ip);
  if (kind === 4) return classifyV4(ip);
  if (kind === 6) return classifyV6(ip);
  return null;
}

function verdict(kind) {
  if (kind === "metadata") return false;
  if (kind === "private") return allowPrivate();
  return true;
}

const hostOf = (u) => new URL(u).hostname.replace(/^\[|\]$/g, "").toLowerCase();
const dbHost = () => (process.env.DB_HOST ?? "").trim().toLowerCase();

/** Synchronous check on the literal host (no DNS). Returns a reason string when blocked, otherwise null. */
export function blockedReason(rawUrl) {
  let u;
  try { u = new URL(rawUrl); } catch { return "not a valid URL"; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return `only http(s) is allowed, not ${u.protocol}`;
  if (u.username || u.password) return "URLs with embedded credentials are not allowed";
  const host = hostOf(rawUrl);
  if (dbHost() && host === dbHost()) return "the database host is off limits";
  if (host === "localhost" || host.endsWith(".localhost")) return allowPrivate() ? null : "localhost is not allowed";
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".home.arpa")) return allowPrivate() ? null : "internal hostnames are not allowed";
  if (isIP(host) && !verdict(classifyIp(host))) return "private or internal addresses are not allowed";
  return null;
}

/** Full check for a live request: the literal host plus every address its DNS name resolves to. */
export async function requestBlockedReason(rawUrl, cache = new Map()) {
  let u;
  try { u = new URL(rawUrl); } catch { return "not a valid URL"; }
  if (["data:", "blob:", "about:"].includes(u.protocol)) return null; // no network access
  const literal = blockedReason(rawUrl);
  if (literal) return literal;
  const host = hostOf(rawUrl);
  if (isIP(host)) return null;
  let blocked = cache.get(host);
  if (blocked === undefined) {
    try {
      const addrs = await lookup(host, { all: true });
      blocked = addrs.some((a) => !verdict(classifyIp(a.address))) ? "hostname resolves to a private or internal address" : null;
    } catch {
      blocked = null; // unresolvable: the browser will fail on its own
    }
    cache.set(host, blocked);
  }
  return blocked;
}
