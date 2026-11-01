"use client";
import { useMemo, useSyncExternalStore } from "react";
import { Cloud, Eye, EyeOff, Laptop } from "lucide-react";
import { cn } from "@/lib/utils";
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

/** A NativeSelect with a leading icon. */
function IconSelect({ icon: Icon, className, children, ...props }) {
  return (
    <div className="relative inline-flex">
      <Icon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <NativeSelect className={cn("w-auto field-sizing-content pl-8 pr-1.5", className)} {...props}>{children}</NativeSelect>
    </div>
  );
}

export function BrowserRunOptions({ opts, update, disabled }) {
  const local = opts.where === "local";
  return (
    <>
      <IconSelect icon={local ? Laptop : Cloud} aria-label="Run where" title="Hosted runs on the server (headless, public sites only). My machine uses the local runner (npx testtrack-runner) so you can watch the browser or reach private sites." value={opts.where} disabled={disabled} onChange={(e) => update({ where: e.target.value })}>
        <option value="hosted">Hosted</option>
        <option value="local">My machine</option>
      </IconSelect>
      <IconSelect icon={opts.headless ? EyeOff : Eye} aria-label="Window mode" title="Headless runs in the background; Browser opens a visible window (My machine only). Applies to every Run in browser button." value={opts.headless ? "headless" : "visible"} disabled={disabled} onChange={(e) => update({ headless: e.target.value === "headless" })}>
        <option value="headless">Headless</option>
        <option value="visible">Browser</option>
      </IconSelect>
    </>
  );
}
