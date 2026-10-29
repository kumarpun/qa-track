"use client";
import { List, ListChecks, ListOrdered } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { applyList, continueList } from "./list-tools";

/** Wire list formatting to a controlled textarea: `menu` is the toolbar button, `onKeyDown` continues lists on Enter. */
export function useListEditing(ref, value, setValue) {
  const select = (start, end) => requestAnimationFrame(() => { ref.current?.focus(); ref.current?.setSelectionRange(start, end); });
  const apply = (kind) => {
    const el = ref.current;
    const r = applyList(value, el?.selectionStart ?? value.length, el?.selectionEnd ?? value.length, kind);
    setValue(r.text);
    select(r.start, r.end);
  };
  const onKeyDown = (e) => {
    if (e.key !== "Enter" || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey || e.nativeEvent.isComposing) return false;
    const el = ref.current;
    if (!el || el.selectionStart !== el.selectionEnd) return false;
    const r = continueList(value, el.selectionStart);
    if (!r) return false;
    e.preventDefault();
    setValue(r.text);
    select(r.pos, r.pos);
    return true;
  };
  return { apply, onKeyDown };
}

export function ListMenu({ onPick }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Format as list" className="rounded-md p-1.5 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        <List className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={() => onPick("bullet")}><List /> List</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onPick("number")}><ListOrdered /> Numbered list</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onPick("check")}><ListChecks /> Checklist</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
