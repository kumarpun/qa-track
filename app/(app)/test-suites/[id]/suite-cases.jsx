"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { addCasesAction, removeCaseAction, reorderCasesAction, searchPickableCasesAction } from "@/app/actions/suites";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PRIORITY_TONE, label } from "../../test-cases/labels";

/** Ordered case list with up/down reorder, removal and an add-cases picker. Order persists on every move. */
export function SuiteCases({ projectId, suiteId, cases, editable }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");
  const [options, setOptions] = useState([]);
  const [chosen, setChosen] = useState(() => new Set());

  useEffect(() => {
    if (!picking) return;
    let live = true;
    const t = setTimeout(async () => {
      const res = await searchPickableCasesAction(projectId, suiteId, q);
      if (live && res.ok) setOptions(res.data);
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [picking, q, projectId, suiteId, cases.length]);

  const move = (i, d) =>
    start(async () => {
      const ids = cases.map((c) => c.id);
      [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
      const res = await reorderCasesAction(projectId, suiteId, ids);
      if (!res.ok) return toast.error(res.error);
      router.refresh();
    });
  const remove = (id) =>
    start(async () => {
      const res = await removeCaseAction(projectId, suiteId, id);
      if (!res.ok) return toast.error(res.error);
      toast.success("Removed from suite");
      router.refresh();
    });
  const add = () =>
    start(async () => {
      const res = await addCasesAction(projectId, suiteId, [...chosen]);
      if (!res.ok) return toast.error(res.error);
      toast.success(`Added ${res.data.added} test case(s)`);
      setChosen(new Set());
      setPicking(false);
      router.refresh();
    });
  const toggle = (id) => setChosen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="space-y-4">
      {cases.length === 0 ? (
        <p className="text-sm text-muted-foreground">No test cases in this suite yet.</p>
      ) : (
        <ol className="divide-y rounded-lg border" data-testid="suite-cases">
          {cases.map((c, i) => (
            <li key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm" data-testid="suite-case">
              <span className="w-6 text-xs text-muted-foreground">{i + 1}</span>
              <Link href={`/test-cases/${c.id}`} className="font-mono text-xs hover:underline">{c.code}</Link>
              <span className="min-w-0 flex-1 truncate">{c.title}</span>
              {c.archived && <Badge variant="outline">Archived</Badge>}
              <Badge variant="secondary" className={PRIORITY_TONE[c.priority]}>{label(c.priority)}</Badge>
              {editable && (
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon-sm" aria-label={`Move ${c.code} up`} disabled={pending || i === 0} onClick={() => move(i, -1)}><ArrowUp /></Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Move ${c.code} down`} disabled={pending || i === cases.length - 1} onClick={() => move(i, 1)}><ArrowDown /></Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Remove ${c.code}`} disabled={pending} onClick={() => remove(c.id)}><X /></Button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {editable && !picking && <Button variant="outline" size="sm" onClick={() => setPicking(true)}><Plus /> Add test cases</Button>}
      {editable && picking && (
        <div className="space-y-3 rounded-lg border p-3">
          <Input aria-label="Search cases to add" placeholder="Search title or code…" value={q} onChange={(e) => setQ(e.target.value)} />
          {options.length === 0 ? (
            <p className="text-sm text-muted-foreground">No more active test cases match.</p>
          ) : (
            <ul className="max-h-64 space-y-1 overflow-auto">
              {options.map((o) => (
                <li key={o.id}>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input type="checkbox" checked={chosen.has(o.id)} onChange={() => toggle(o.id)} />
                    <span className="font-mono text-xs">{o.code}</span> {o.title}
                  </label>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <Button size="sm" disabled={pending || chosen.size === 0} onClick={add}>Add {chosen.size || ""} selected</Button>
            <Button size="sm" variant="outline" onClick={() => { setPicking(false); setChosen(new Set()); }}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
