"use client";
import { useMemo, useRef, useState } from "react";
import { Square, SquareCheck } from "lucide-react";
import { CHECK_LINE } from "./list-tools";

const TRIGGER = /(^|\s)@([^\s@]{0,30})$/;
const CHECK_PREFIX = /^(\s*[-*]\s\[([ xX])\]\s)(.*)$/;

/** Mirror of the text with "- [ ] " drawn as a checkbox icon of the same width, so the caret still lines up with the real textarea above it. */
function Mirror({ value, className, scroll }) {
  return (
    <div aria-hidden className={`${className} pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words`}>
      <div style={{ transform: `translateY(${-scroll}px)` }}>
        {value.split("\n").map((line, i) => {
          const m = line.match(CHECK_PREFIX);
          return (
            <span key={i}>
              {m ? (
                <>
                  <span className="relative inline-block">
                    <span className="invisible">{m[1]}</span>
                    {m[2] === " " ? <Square className="absolute left-0.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /> : <SquareCheck className="absolute left-0.5 top-1/2 size-3.5 -translate-y-1/2 text-primary" />}
                  </span>
                  <span className={m[2] === " " ? "" : "text-muted-foreground line-through"}>{m[3]}</span>
                </>
              ) : line}
              {"\n"}
            </span>
          );
        })}
        {"\u200b"}
      </div>
    </div>
  );
}

/**
 * Textarea that suggests project members after typing "@". Picking one inserts "@Name " and reports it through
 * `onPick({id,name})`; the caller turns the picked names into stored mentions with `encodeMentions` on submit.
 */
export function MentionTextarea({ value, onChange, onPick, members = [], onKeyDown, areaRef, className = "", ...rest }) {
  const own = useRef(null);
  const ref = areaRef ?? own;
  const [caret, setCaret] = useState(0);
  const [dismissed, setDismissed] = useState(null); // caret position where the user pressed Escape
  const [active, setActive] = useState(0);
  const [scroll, setScroll] = useState(0);
  const hasChecks = value.split("\n").some((l) => CHECK_LINE.test(l));

  const trigger = useMemo(() => {
    const m = value.slice(0, caret).match(TRIGGER);
    return m ? { query: m[2], start: caret - m[2].length - 1 } : null;
  }, [value, caret]);
  const options = useMemo(() => {
    if (!trigger || dismissed === trigger.start) return [];
    const q = trigger.query.toLowerCase();
    return members.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 6);
  }, [trigger, members, dismissed]);
  const open = options.length > 0;
  const current = Math.min(active, options.length - 1);

  const pick = (m) => {
    const next = `${value.slice(0, trigger.start)}@${m.name} ${value.slice(caret)}`;
    const pos = trigger.start + m.name.length + 2;
    onChange(next);
    onPick(m);
    setCaret(pos);
    requestAnimationFrame(() => { ref.current?.focus(); ref.current?.setSelectionRange(pos, pos); });
  };

  const keys = (e) => {
    if (open) {
      if (e.key === "ArrowDown") { e.preventDefault(); setActive((current + 1) % options.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setActive((current + options.length - 1) % options.length); return; }
      if ((e.key === "Enter" && !e.metaKey && !e.ctrlKey) || e.key === "Tab") { e.preventDefault(); pick(options[current]); return; }
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setDismissed(trigger.start); return; }
    }
    onKeyDown?.(e);
  };

  return (
    <div className="relative min-w-0 flex-1">
      {hasChecks && <Mirror value={value} className={className} scroll={scroll} />}
      <textarea
        {...rest}
        className={hasChecks ? `${className} relative text-transparent caret-foreground` : className}
        onScroll={(e) => setScroll(e.target.scrollTop)}
        ref={ref}
        value={value}
        onChange={(e) => { onChange(e.target.value); setCaret(e.target.selectionStart); setActive(0); }}
        onSelect={(e) => setCaret(e.target.selectionStart)}
        onKeyDown={keys}
        role="combobox"
        aria-expanded={open}
        aria-controls="mention-options"
        aria-autocomplete="list"
      />
      {open && (
        <ul id="mention-options" role="listbox" aria-label="Mention a member" className="absolute bottom-full left-0 z-50 mb-1 max-h-56 w-64 overflow-auto rounded-lg border bg-popover p-1 text-sm shadow-md">
          {options.map((m, i) => (
            <li key={m.id} role="option" aria-selected={i === current}
              onMouseDown={(e) => { e.preventDefault(); pick(m); }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer rounded-md px-2 py-1.5 ${i === current ? "bg-muted" : ""}`}>
              {m.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
