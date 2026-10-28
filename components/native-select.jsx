import { cn } from "@/lib/utils";

/** Plain <select> styled like Input: accessible, works with react-hook-form `register`. */
export function NativeSelect({ className, children, ref, ...props }) {
  return (
    <select
      ref={ref}
      className={cn(
        "h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
