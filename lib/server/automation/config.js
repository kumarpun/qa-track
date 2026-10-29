import "server-only";

/**
 * Browser runs open a real Chromium window on the machine that runs this server and visit URLs taken from
 * test cases, so they are opt-in per deployment. This is a server-side gate, not just a hidden button.
 */
export const browserRunsEnabled = () => process.env.ENABLE_BROWSER_RUNS === "1";
