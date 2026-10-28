import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_LABELS } from "@/lib/metrics";

const TONES = {
  PASSED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  FAILED: "bg-red-500/15 text-red-700 dark:text-red-400",
  BLOCKED: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  SKIPPED: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  RETEST: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  NOT_RUN: "bg-muted text-muted-foreground",
  ACTIVE: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  ARCHIVED: "bg-muted text-muted-foreground",
  DRAFT: "bg-muted text-muted-foreground",
  IN_PROGRESS: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  COMPLETED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  OPEN: "bg-red-500/15 text-red-700 dark:text-red-400",
  REOPENED: "bg-red-500/15 text-red-700 dark:text-red-400",
  FIXED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  CLOSED: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  CANCELLED: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
};

export function StatusBadge({ status, label, className }) {
  return (
    <Badge variant="outline" className={cn("border-transparent font-medium", TONES[status], className)}>
      {label ?? STATUS_LABELS[status] ?? String(status).replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
    </Badge>
  );
}
