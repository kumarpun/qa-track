"use client";
import { useMemo, useSyncExternalStore } from "react";
import { NativeSelect } from "@/components/native-select";

const KEY = "qa.browserRunOptions";
const DEFAULTS = { headless: true };

const listeners = new Set();
const read = () => { try { return localStorage.getItem(KEY) ?? ""; } catch { return ""; } };
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const parse = (raw) => { try { return { ...DEFAULTS, ...JSON.parse(raw || "{}") }; } catch { return DEFAULTS; } };

/** Headless choice for "Run in browser", remembered per viewer in localStorage (hydration-safe). */
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
      <NativeSelect aria-label="Window mode" title="Headless runs in the background; Browser opens a visible window. Applies to every Run in browser button." className="w-auto" value={opts.headless ? "headless" : "visible"} disabled={disabled} onChange={(e) => update({ headless: e.target.value === "headless" })}>
        <option value="headless">Headless</option>
        <option value="visible">Browser</option>
      </NativeSelect>
    </>
  );
}
