// Local runner for the repo checkout: lets the hosted app (e.g. on Vercel) run "Run in browser" on THIS machine.
//   npm run runner            (RUNNER_ALLOWED_ORIGINS=https://your-app.vercel.app,... to allow the hosted site)
// Customers without the repo use the published CLI instead (see runner/).
import "dotenv/config";
import { register } from "node:module";

register("./runner-hooks.mjs", import.meta.url);
const { startRunner } = await import("./runner-server.mjs");
startRunner({ port: Number(process.env.RUNNER_PORT || 4455), origins: (process.env.RUNNER_ALLOWED_ORIGINS ?? "").split(",") });
