#!/usr/bin/env node
// Published CLI: `npx testtrack-runner --origin https://your-app.example.com`
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { chromium } from "playwright-core";
import { existsSync } from "node:fs";
import { startRunner } from "../../scripts/runner-server.mjs";

const HELP = `testtrack-runner: run TestTrack browser tests on this machine

Usage: npx testtrack-runner --origin <app url> [--port 4455] [--allow-private]

  --origin         URL of your TestTrack site, e.g. https://qa.example.com (repeatable)
  --port           local port (default 4455)
  --allow-private  let tests visit localhost / private-network URLs
`;

const args = process.argv.slice(2);
const origins = [];
let port = 4455;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--origin") origins.push(args[++i] ?? "");
  else if (a === "--port") port = Number(args[++i]);
  else if (a === "--allow-private") process.env.BROWSER_RUNS_ALLOW_PRIVATE = "1";
  else { console.log(HELP); process.exit(a === "--help" || a === "-h" ? 0 : 1); }
}
if (!origins.filter(Boolean).length || !Number.isInteger(port)) { console.log(HELP); process.exit(1); }

if (!existsSync(chromium.executablePath())) {
  console.log("First run: downloading Chromium (one time, ~150MB)...");
  const cli = createRequire(import.meta.url).resolve("playwright-core/cli");
  if (spawnSync(process.execPath, [cli, "install", "chromium"], { stdio: "inherit" }).status !== 0) {
    console.error("Could not download Chromium.");
    process.exit(1);
  }
}
startRunner({ port, origins });
