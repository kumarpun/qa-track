"use client";
import { useMemo, useSyncExternalStore } from "react";
import { NativeSelect } from "@/components/native-select";

const KEY = "qa.browserRunOptions";
const DEFAULTS = { headless: true, where: "hosted" };

const listeners = new Set();
const read = () => { try { return localStorage.getItem(KEY) ?? ""; } catch { return ""; } };
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const parse = (raw) => { try { return { ...DEFAULTS, ...JSON.parse(raw || "{}") }; } catch { return DEFAULTS; } };

/** Where to run (hosted server or this machine) and headless choice for "Run in browser", remembered per viewer in localStorage (hydration-safe). */
export function useBrowserOptions() {
  const raw = useSyncExternalStore(subscribe, read, () => "");
  const opts = useMemo(() => parse(raw), [raw]);
  const update = (patch) => {
    try { localStorage.setItem(KEY, JSON.stringify({ ...opts, ...patch })); } catch {}
    listeners.forEach((fn) => fn());
  };
  return [opts, update];
}

export function BrowserRunOptions({ opts, update, disabled }) {
  return (
    <>
      <NativeSelect aria-label="Run where" title="Hosted runs on the server (headless, public sites only). My machine uses the local runner (npx testtrack-runner) so you can watch the browser or reach private sites." className="w-auto" value={opts.where} disabled={disabled} onChange={(e) => update({ where: e.target.value })}>
        <option value="hosted">Hosted</option>
        <option value="local">My machine</option>
      </NativeSelect>
      <NativeSelect aria-label="Window mode" title="Headless runs in the background; Browser opens a visible window (My machine only). Applies to every Run in browser button." className="w-auto" value={opts.headless ? "headless" : "visible"} disabled={disabled} onChange={(e) => update({ headless: e.target.value === "headless" })}>
        <option value="headless">Headless</option>
        <option value="visible">Browser</option>
      </NativeSelect>
    </>
  );
}
