"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { ENVIRONMENTS, RUN_STATUSES } from "@/lib/validation/run";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/native-select";
import { label } from "../test-cases/labels";

export function RunFilters({ params }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(params.q);
  const [build, setBuild] = useState(params.build);
  const timer = useRef(null);

  const set = (patch) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
    next.delete("page");
    router.replace(`${pathname}?${next}`);
  };

  useEffect(() => {
    if (q === params.q && build === params.build) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => set({ q, build }), 350);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, build]);

  const active = params.q || params.status || params.environment || params.build;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Input aria-label="Search runs" placeholder="Search name or code…" className="w-56" value={q} onChange={(e) => setQ(e.target.value)} />
      <NativeSelect aria-label="Status" className="w-auto min-w-32" value={params.status ?? ""} onChange={(e) => set({ status: e.target.value })}>
        <option value="">Any status</option>
        {RUN_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
      </NativeSelect>
      <NativeSelect aria-label="Environment" className="w-auto min-w-32" value={params.environment ?? ""} onChange={(e) => set({ environment: e.target.value })}>
        <option value="">Any environment</option>
        {ENVIRONMENTS.map((s) => <option key={s} value={s}>{label(s)}</option>)}
      </NativeSelect>
      <Input aria-label="Filter by build" placeholder="Build" className="w-28" value={build} onChange={(e) => setBuild(e.target.value)} />
      {active && <Button variant="ghost" size="sm" onClick={() => { setQ(""); setBuild(""); router.replace(pathname); }}><X /> Clear</Button>}
    </div>
  );
}
