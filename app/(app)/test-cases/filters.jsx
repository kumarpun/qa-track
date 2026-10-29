"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { PRIORITIES, TYPES, AUTOMATION } from "@/lib/validation/testcase";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/native-select";
import { label } from "./labels";

export function Filters({ params, members }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(params.q);
  const [tag, setTag] = useState(params.tag ?? "");
  const timer = useRef(null);

  const set = (patch) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
    next.delete("page");
    router.replace(`${pathname}?${next}`);
  };

  // Debounce free-text inputs so each keystroke does not hit the database.
  useEffect(() => {
    if (q === params.q && tag === (params.tag ?? "")) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => set({ q, tag }), 350);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, tag]);

  const sel = (name, options, any) => (
    <NativeSelect aria-label={any} className="w-auto min-w-32" value={params[name] ?? ""} onChange={(e) => set({ [name]: e.target.value })}>
      <option value="">{any}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </NativeSelect>
  );
  const opts = (list) => list.map((v) => ({ value: v, label: label(v) }));
  const active = params.q || params.priority || params.type || params.automation || params.assignee || params.tag;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Input aria-label="Search test cases" placeholder="Search title or code…" className="w-56" value={q} onChange={(e) => setQ(e.target.value)} />
      {sel("priority", opts(PRIORITIES), "Any priority")}
      {sel("type", opts(TYPES), "Any type")}
      {sel("automation", opts(AUTOMATION), "Any automation")}
      {sel("assignee", members.map((m) => ({ value: m.id, label: m.name })), "Any assignee")}
      <Input aria-label="Filter by tag" placeholder="Tag" className="w-28" value={tag} onChange={(e) => setTag(e.target.value)} />
      {active && (
        <Button variant="ghost" size="sm" onClick={() => { setQ(""); setTag(""); router.replace(pathname); }}><X /> Clear</Button>
      )}
    </div>
  );
}
