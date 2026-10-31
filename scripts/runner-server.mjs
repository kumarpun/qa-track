// Runner HTTP server, shared by `npm run runner` (scripts/local-runner.mjs) and the published CLI (runner/src/cli.mjs).
import http from "node:http";
import { runInBrowser } from "../lib/server/automation/browser-runner.js";

const MAX_BODY = 1_000_000;
const HOST = "127.0.0.1";

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(body));
};

export function startRunner({ port, origins }) {
  const PORT = port;
  const ALLOWED = new Set(["http://localhost:3000", "http://127.0.0.1:3000", ...origins.map((s) => s.trim().replace(/\/$/, "")).filter(Boolean)]);

  const server = http.createServer(async (req, res) => {
    // Anything that is not the allow-listed web app is refused, so no other site can drive this browser.
    const origin = req.headers.origin;
    const hostOk = [`${HOST}:${PORT}`, `localhost:${PORT}`].includes(req.headers.host ?? ""); // blocks DNS rebinding
    if (!hostOk || !origin || !ALLOWED.has(origin)) return send(res, 403, { error: `Origin ${origin ?? "(none)"} is not allowed. Start the runner with --origin <your app URL>.` });
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
}
