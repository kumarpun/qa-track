// Local runner: lets the hosted app (e.g. on Vercel) run "Run in browser" on THIS machine.
// The page sends validated steps here; Chromium opens locally; the outcome goes back to the page, which saves it.
//   npm run runner            (RUNNER_ALLOWED_ORIGINS=https://your-app.vercel.app,... to allow the hosted site)
import "dotenv/config";
import http from "node:http";
import { register } from "node:module";

register("./runner-hooks.mjs", import.meta.url);
const { runInBrowser } = await import("../lib/server/automation/browser-runner.js");

const PORT = Number(process.env.RUNNER_PORT || 4455);
const HOST = "127.0.0.1";
const ALLOWED = new Set(["http://localhost:3000", "http://127.0.0.1:3000", ...(process.env.RUNNER_ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean)]);
const MAX_BODY = 1_000_000;

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(body));
};

const server = http.createServer(async (req, res) => {
  // Anything that is not the allow-listed web app is refused, so no other site can drive this browser.
  const origin = req.headers.origin;
  const hostOk = [`${HOST}:${PORT}`, `localhost:${PORT}`].includes(req.headers.host ?? ""); // blocks DNS rebinding
  if (!hostOk || !origin || !ALLOWED.has(origin)) return send(res, 403, { error: `Origin ${origin ?? "(none)"} is not allowed. Set RUNNER_ALLOWED_ORIGINS.` });
  const cors = {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Private-Network": "true",
  };
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true }, cors);
  if (req.method !== "POST" || req.url !== "/run") return send(res, 404, { error: "Not found" }, cors);

  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_BODY) return send(res, 413, { error: "Request too large" }, cors);
  }
  let body;
  try { body = JSON.parse(raw); } catch { return send(res, 400, { error: "Invalid JSON" }, cors); }
  const { instructions, headless } = body ?? {};
  if (!Array.isArray(instructions) || !instructions.length || instructions.length > 500) return send(res, 400, { error: "No steps to run" }, cors);

  console.log(`[${new Date().toLocaleTimeString()}] run ${instructions.length} steps (${headless === false ? "visible" : "headless"}) for ${origin}`);
  const out = await runInBrowser(instructions, { headless: headless !== false });
  if (out.busy) return send(res, 409, { error: "Another browser run is in progress on this machine. Try again in a moment." }, cors);
  console.log(`  -> ${out.status}`);
  send(res, 200, { status: out.status, log: out.log, finalUrl: out.finalUrl ?? null }, cors);
});

server.listen(PORT, HOST, () => {
  console.log(`Local runner ready on http://${HOST}:${PORT}`);
  console.log(`Allowed origins: ${[...ALLOWED].join(", ")}`);
});
