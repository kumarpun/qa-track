"use client";
import { useRouter } from "next/navigation";
import { TableRow } from "@/components/ui/table";

// Controls inside a row keep their own behaviour; fill-handle cells are skipped so a drag release never navigates.
const INTERACTIVE = "a, button, input, select, textarea, label, [role='combobox'], [role='listbox'], [role='menu'], [data-fill-group]";

/** Table row that opens `href` when clicked anywhere that is not a control (links and portalled menus excluded). */
export function ClickableRow({ href, onClick, className = "", ...props }) {
  const router = useRouter();
  return (
    <TableRow
      {...props}
      className={`cursor-pointer ${className}`}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || !e.currentTarget.contains(e.target) || e.target.closest(INTERACTIVE)) return;
        if (window.getSelection()?.toString()) return; // user is selecting text
        router.push(href);
      }}
    />
  );
}
