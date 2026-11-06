import { toast } from "sonner";
import { RUNNER_UNREACHABLE_EVENT } from "./runner-events";
import { runCaseInBrowserAction, runRunCaseInBrowserAction, finishCaseRunAction, finishRunCaseRunAction } from "@/app/actions/automation";

/** The local runner (`npm run runner`) listens here on the tester's own machine. */
export const RUNNER_URL = process.env.NEXT_PUBLIC_RUNNER_URL || "http://127.0.0.1:4455";

const unreachable = () =>
  `Local runner not reachable at ${RUNNER_URL}. Start it on your machine with "npx testtrack-runner --origin <this site>" (see Documentation → Run in browser), then try again.`;

/** Shows a run error; when the local runner is down it opens the centered setup popup instead of a toast. */
export function showRunError(message) {
  if (String(message).includes("Local runner not reachable")) return window.dispatchEvent(new Event(RUNNER_UNREACHABLE_EVENT));
  return toast.error(message);
}

/** Sends validated steps to the runner on this machine; resolves to { ok, data: report } or { ok: false, error }. */
async function callRunner(instructions, opts) {
  let res;
  try {
    res = await fetch(`${RUNNER_URL}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instructions, headless: opts?.headless }),
    });
  } catch {
    return { ok: false, error: unreachable() };
  }
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) return { ok: false, error: body?.error ?? `Local runner error (${res.status})` };
  return { ok: true, data: body };
}

/** Sends the runner's failure screenshot (base64 PNG) to the server, which puts it on freeimage.host. Returns the URL, or null (a missing picture never blocks saving the result). */
async function uploadShot(projectId, base64) {
  if (!base64) return null;
  try {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const form = new FormData();
    form.set("projectId", projectId);
    form.set("file", new File([bytes], "failure.png", { type: "image/png" }));
    const res = await fetch("/api/auto-run-shots", { method: "POST", body: form });
    return res.ok ? ((await res.json()).url ?? null) : null;
  } catch {
    return null;
  }
}

/** Report for the server: the runner's result with the screenshot swapped for its hosted URL. */
const toReport = async (projectId, { screenshot, ...rest }) => ({ ...rest, screenshotUrl: await uploadShot(projectId, screenshot) });

/**
 * Run a test case in a browser. Same result shape either way: { ok, data: { status, failedAt } }.
 * Server mode: the server action runs it. Local mode (Vercel): the action returns the steps, this machine runs them.
 */
export async function runCaseInBrowser(projectId, caseId, opts) {
  const res = await runCaseInBrowserAction(projectId, caseId, opts);
  if (!res.ok || !res.data.local) return res;
  const ran = await callRunner(res.data.instructions, opts);
  if (!ran.ok) return ran;
  return finishCaseRunAction(projectId, caseId, await toReport(projectId, ran.data), res.data.startedAt);
}

export async function runRunCaseInBrowser(projectId, runCaseId, opts) {
  const res = await runRunCaseInBrowserAction(projectId, runCaseId, opts);
  if (!res.ok || !res.data.local) return res;
  const ran = await callRunner(res.data.instructions, opts);
  if (!ran.ok) return ran;
  return finishRunCaseRunAction(projectId, runCaseId, await toReport(projectId, ran.data), opts);
}
