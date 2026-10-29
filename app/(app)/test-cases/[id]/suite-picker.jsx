"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Popover } from "@base-ui/react/popover";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { createSuiteAction, setCaseSuiteAction } from "@/app/actions/suites";
import { cn } from "@/lib/utils";

/** Pick the one test suite this case belongs to (radio): choosing another moves it, "No suite" clears it, or create a new suite from here. Saved immediately. */
export function SuitePicker({ projectId, caseId, suites, memberOf }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [query, setQuery] = useState("");
  const [known, setKnown] = useState(suites);
  const [selected, setSelected] = useState(memberOf[0] ?? null);
  const q = query.trim();
  const shown = known.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()));
  const canCreate = q && !known.some((s) => s.name.toLowerCase() === q.toLowerCase());

  const choose = (id) =>
    start(async () => {
      const prev = selected;
      const res = await setCaseSuiteAction(projectId, caseId, id);
      if (!res.ok) {
        setSelected(prev);
        return toast.error(res.error);
      }
      setSelected(id);
      setQuery("");
      router.refresh();
    });

  const create = () =>
    start(async () => {
      const made = await createSuiteAction(projectId, { name: q });
      if (!made.ok) return toast.error(made.error);
      const suite = { id: made.data.id, name: q };
      setKnown((k) => [...k, suite]);
      const res = await setCaseSuiteAction(projectId, caseId, suite.id);
      if (!res.ok) toast.error(`Suite "${q}" created, but adding this case failed: ${res.error}`);
      else setSelected(suite.id);
      setQuery("");
      router.refresh();
    });

  const onKeyDown = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (pending) return;
    if (canCreate) create();
    else if (shown[0]) choose(shown[0].id);
  };

  const current = known.find((s) => s.id === selected);
  const radio = (on) => (
    <span className={cn("grid size-4 shrink-0 place-items-center rounded-full border", on && "border-primary")}>
      {on && <span className="size-2 rounded-full bg-primary" />}
    </span>
  );
  const row = "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-60";
  return (
    <Popover.Root onOpenChange={() => setQuery("")}>
      {/* A single trigger keeps the popup anchored to the field. */}
      <Popover.Trigger aria-label="Change test suite" className="inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50">
        {current ? current.name : <><Plus className="size-3.5 text-muted-foreground" /><span className="text-muted-foreground">Add to suite</span></>}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={6} className="isolate z-50">
          <Popover.Popup className="w-64 origin-(--transform-origin) rounded-xl bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Find or create a suite…"
              className="w-full border-b bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
            />
            <ul role="radiogroup" aria-label="Test suite" className="max-h-60 overflow-y-auto p-1">
              {!q && (
                <li>
                  <button type="button" role="radio" aria-checked={!selected} disabled={pending} onClick={() => selected && choose(null)} className={row}>
                    {radio(!selected)}<span className="text-muted-foreground">No suite</span>
                  </button>
                </li>
              )}
              {shown.map((s) => (
                <li key={s.id}>
                  <button type="button" role="radio" aria-checked={s.id === selected} disabled={pending} onClick={() => s.id !== selected && choose(s.id)} className={row}>
                    {radio(s.id === selected)}<span className="truncate">{s.name}</span>
                  </button>
                </li>
              ))}
              {canCreate && (
                <li>
                  <button type="button" disabled={pending} onClick={create} className={row}>
                    <Plus className="size-4 shrink-0 text-muted-foreground" />Create suite “{q}”
                  </button>
                </li>
              )}
            </ul>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
