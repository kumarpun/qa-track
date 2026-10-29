"use client";
import { useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const PRESETS = ["Bug", "Improvement", "Feature"];
const DOTS = ["bg-red-500", "bg-blue-500", "bg-green-500", "bg-yellow-500", "bg-purple-500", "bg-orange-500", "bg-pink-500", "bg-teal-500"];
const PRESET_DOT = { bug: DOTS[0], improvement: DOTS[1], feature: DOTS[2] };

const dotFor = (name) => {
  const key = name.toLowerCase();
  if (PRESET_DOT[key]) return PRESET_DOT[key];
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return DOTS[3 + (h % (DOTS.length - 3))];
};

const Dot = ({ name }) => <span className={cn("size-2.5 shrink-0 rounded-full", dotFor(name))} />;

/** Linear-style label picker: selected labels show as pills, the popover lists presets plus any custom ones and creates new ones on Enter. */
export function LabelPicker({ id, value, onChange }) {
  const [query, setQuery] = useState("");
  const q = query.trim();
  const has = (list, name) => list.some((t) => t.toLowerCase() === name.toLowerCase());
  const options = [...PRESETS, ...value.filter((t) => !has(PRESETS, t))];
  const shown = options.filter((o) => o.toLowerCase().includes(q.toLowerCase()));
  const canCreate = q && !has(options, q);

  const toggle = (name) => {
    onChange(has(value, name) ? value.filter((t) => t.toLowerCase() !== name.toLowerCase()) : [...value, name]);
    setQuery("");
  };
  const onKeyDown = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (canCreate) toggle(q);
    else if (shown[0]) toggle(shown[0]);
  };

  return (
    <Popover.Root onOpenChange={() => setQuery("")}>
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((t) => (
          <Popover.Trigger key={t} className="inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50">
            <Dot name={t} />{t}
          </Popover.Trigger>
        ))}
        <Popover.Trigger id={id} aria-label="Add label" className="inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50">
          <Plus className="size-3.5" />{value.length === 0 && "Add label"}
        </Popover.Trigger>
      </div>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={6} className="isolate z-50">
          <Popover.Popup className="w-64 origin-(--transform-origin) rounded-xl bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Change or add labels…"
              className="w-full border-b bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
            />
            <ul className="max-h-60 overflow-y-auto p-1">
              {shown.map((o) => {
                const on = has(value, o);
                return (
                  <li key={o}>
                    <button type="button" onClick={() => toggle(o)} className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted">
                      <span className={cn("grid size-4 shrink-0 place-items-center rounded border", on && "border-primary bg-primary text-primary-foreground")}>
                        {on && <Check className="size-3" />}
                      </span>
                      <Dot name={o} />{o}
                    </button>
                  </li>
                );
              })}
              {canCreate && (
                <li>
                  <button type="button" onClick={() => toggle(q)} className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted">
                    <Plus className="size-4 shrink-0 text-muted-foreground" />Create “{q}”
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
