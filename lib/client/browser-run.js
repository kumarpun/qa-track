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

/**
 * Run a test case in a browser. Same result shape either way: { ok, data: { status, failedAt } }.
 * Server mode: the server action runs it. Local mode (Vercel): the action returns the steps, this machine runs them.
 */
export async function runCaseInBrowser(projectId, caseId, opts) {
  const res = await runCaseInBrowserAction(projectId, caseId, opts);
  if (!res.ok || !res.data.local) return res;
  const ran = await callRunner(res.data.instructions, opts);
  if (!ran.ok) return ran;
  return finishCaseRunAction(projectId, caseId, ran.data, res.data.startedAt);
}

export async function runRunCaseInBrowser(projectId, runCaseId, opts) {
  const res = await runRunCaseInBrowserAction(projectId, runCaseId, opts);
  if (!res.ok || !res.data.local) return res;
  const ran = await callRunner(res.data.instructions, opts);
  if (!ran.ok) return ran;
  return finishRunCaseRunAction(projectId, runCaseId, ran.data, opts);
}
