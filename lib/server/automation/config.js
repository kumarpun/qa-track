import "server-only";

/**
 * Browser runs drive a real Chromium and visit URLs taken from test cases, so they are opt-in per deployment
 * (ENABLE_BROWSER_RUNS=1). This is a server-side gate, not just a hidden button.
 *
 * - "server": this server opens the browser itself (local `next dev`, self-hosted, or Vercel via the bundled
 *             @sparticuz/chromium: headless, public sites only, no persistent disk for screenshots).
 * - "local":  opt-in on Vercel with BROWSER_RUN_MODE=local: the signed-in user's own machine runs the steps through the
 *             local runner (`npm run runner`); this server only prepares the steps and records the result.
 */
export const browserRunMode = () => (process.env.ENABLE_BROWSER_RUNS !== "1" ? null : process.env.VERCEL && process.env.BROWSER_RUN_MODE === "local" ? "local" : "server");
export const browserRunsEnabled = () => browserRunMode() !== null;
