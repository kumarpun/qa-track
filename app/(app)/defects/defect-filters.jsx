"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { DEFECT_PRIORITIES, DEFECT_STATUSES, SEVERITIES } from "@/lib/validation/defect";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/native-select";
import { label } from "../test-cases/labels";

export function DefectFilters({ params, assignees }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(params.q);
  const timer = useRef(null);

  const set = (patch) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
    next.delete("page");
    router.replace(`${pathname}?${next}`);
  };

  useEffect(() => {
    if (q === params.q) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => set({ q }), 350);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const sel = (name, key, options, any) => (
    <NativeSelect aria-label={name} className="w-auto min-w-32" value={params[key] ?? ""} onChange={(e) => set({ [key]: e.target.value })}>
      <option value="">{any}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </NativeSelect>
  );
  const opts = (list) => list.map((v) => ({ value: v, label: label(v) }));
  const active = params.q || params.status || params.severity || params.priority || params.assignee;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Input aria-label="Search defects" placeholder="Search title or code…" className="w-56" value={q} onChange={(e) => setQ(e.target.value)} />
      {sel("Status", "status", opts(DEFECT_STATUSES), "Any status")}
      {sel("Severity", "severity", opts(SEVERITIES), "Any severity")}
      {sel("Priority", "priority", opts(DEFECT_PRIORITIES), "Any priority")}
      {sel("Assignee", "assignee", assignees.map((a) => ({ value: a.id, label: a.name })), "Any assignee")}
      {active && <Button variant="ghost" size="sm" onClick={() => { setQ(""); router.replace(pathname); }}><X /> Clear</Button>}
    </div>
  );
}
