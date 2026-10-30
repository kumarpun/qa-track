import {
  LayoutDashboard, FolderKanban, FileCheck2, Layers, PlayCircle, ListChecks, Bug, BarChart3, Settings, BookOpen,
} from "lucide-react";

export const NAV = [
  { group: "Overview", href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { group: "Overview", href: "/documentation", label: "Documentation", icon: BookOpen },
  { group: "Workspace", href: "/projects", label: "Projects", icon: FolderKanban },
  { group: "Test management", href: "/test-cases", label: "Test Cases", icon: FileCheck2 },
  { group: "Test management", href: "/test-suites", label: "Test Suites", icon: Layers },
  { group: "Test management", href: "/test-runs", label: "Test Runs", icon: PlayCircle },
  { group: "Test management", href: "/execution", label: "Test Execution", icon: ListChecks },
  { group: "Quality", href: "/defects", label: "Defects", icon: Bug },
  { group: "Quality", href: "/reports", label: "Reports", icon: BarChart3 },
  { group: "Admin", href: "/users", label: "Users & Settings", icon: Settings },
];

/** Splits the (already filtered) nav into consecutive labelled groups, keeping order. */
export function groupNav(items) {
  const groups = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last?.label === item.group) last.items.push(item);
    else groups.push({ label: item.group, items: [item] });
  }
  return groups;
}
