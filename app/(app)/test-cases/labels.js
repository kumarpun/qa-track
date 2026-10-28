const SPECIAL = { TO_BE_AUTOMATED: "To be automated", API: "API", UI: "UI" };

/** "TO_BE_AUTOMATED" → "To be automated" */
export const label = (v) =>
  SPECIAL[v] ?? String(v).replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export const PRIORITY_TONE = {
  CRITICAL: "bg-red-500/15 text-red-700 dark:text-red-400",
  HIGH: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  MEDIUM: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  LOW: "bg-muted text-muted-foreground",
};
