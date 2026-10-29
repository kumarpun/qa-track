import {
  LayoutDashboard, FolderKanban, FileCheck2, Layers, PlayCircle, ListChecks, Bug, BarChart3, ScrollText, Settings, BookOpen,
} from "lucide-react";

export const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/documentation", label: "Documentation", icon: BookOpen },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/test-cases", label: "Test Cases", icon: FileCheck2 },
  { href: "/test-suites", label: "Test Suites", icon: Layers },
  { href: "/test-runs", label: "Test Runs", icon: PlayCircle },
  { href: "/execution", label: "Test Execution", icon: ListChecks },
  { href: "/defects", label: "Defects", icon: Bug },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/audit-log", label: "Audit Log", icon: ScrollText, minRole: "QA_LEAD" },
  { href: "/users", label: "Users & Settings", icon: Settings },
];
