"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FlaskConical, PanelLeftClose, PanelLeftOpen, Search, Moon, Sun, LogOut, User as UserIcon, ChevronsUpDown, Check, Menu } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { NAV, groupNav } from "./nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotificationBell } from "./notification-bell";
import { ROLE_LABELS, hasRole } from "@/lib/permissions";
import { logoutAction } from "@/app/actions/auth";
import { switchProjectAction } from "@/app/actions/projects";

const LABELS = Object.fromEntries(NAV.map((n) => [n.href.slice(1), n.label]));
LABELS.profile = "Profile";
LABELS.new = "New";

function Logo({ withName = true }) {
  return (
    <span className="flex items-center gap-2.5 font-semibold tracking-tight">
      <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-[oklch(0.86_0.12_88)] to-[oklch(0.66_0.12_72)] text-[oklch(0.2_0.03_70)] shadow-[0_0_18px_-2px_oklch(0.78_0.12_82/0.55)]"><FlaskConical className="size-4" aria-hidden /></span>
      {withName && <span className="font-display text-lg">TestTrack</span>}
    </span>
  );
}

const NAV_LINK = "relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-sidebar-foreground/65 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";
const NAV_ACTIVE = "bg-sidebar-accent font-medium text-sidebar-accent-foreground before:absolute before:-left-2 before:top-2 before:bottom-2 before:w-[3px] before:rounded-full before:bg-sidebar-primary [&_svg]:text-sidebar-primary";

function Breadcrumbs() {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);
  if (!parts.length) return <span className="text-sm font-medium">Dashboard</span>;
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <Link href="/" className="hover:text-foreground">Home</Link>
      {parts.map((p, i) => {
        const href = "/" + parts.slice(0, i + 1).join("/");
        const label = LABELS[p] ?? (p.length > 20 ? "Details" : p);
        const last = i === parts.length - 1;
        return (
          <span key={href} className="flex items-center gap-1.5">
            <span aria-hidden>/</span>
            {last ? <span className="font-medium text-foreground">{label}</span> : <Link href={href} className="hover:text-foreground">{label}</Link>}
          </span>
        );
      })}
    </nav>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === "dark";
  return (
    <Button variant="ghost" size="icon" aria-label="Toggle dark mode" onClick={() => setTheme(dark ? "light" : "dark")}>
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}

function ProjectSwitcher({ projects, activeId }) {
  const router = useRouter();
  const active = projects.find((p) => p.id === activeId);
  if (!projects.length) return <span className="text-sm text-muted-foreground">No projects</span>;
  const pick = async (id) => {
    if (id === activeId) return;
    const res = await switchProjectAction(id);
    if (!res.ok) return toast.error(res.error);
    router.refresh();
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" className="min-w-44 justify-between" aria-label="Switch project" />}>
        <span className="truncate">{active ? `${active.key} · ${active.name}` : "Select project"}</span>
        <ChevronsUpDown className="opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {projects.map((p) => (
          <DropdownMenuItem key={p.id} onClick={() => pick(p.id)}>
            <span className="flex-1 truncate">{p.key} · {p.name}</span>
            {p.id === activeId && <Check />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function GlobalSearch() {
  const router = useRouter();
  return (
    <form
      role="search"
      className="relative hidden w-64 md:block"
      onSubmit={(e) => {
        e.preventDefault();
        const q = new FormData(e.currentTarget).get("q")?.toString().trim();
        if (q) router.push(`/test-cases?q=${encodeURIComponent(q)}`);
      }}
    >
      <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
      <Input name="q" aria-label="Search test cases" placeholder="Search test cases…" className="pl-8" />
    </form>
  );
}

function UserMenu({ user }) {
  const router = useRouter();
  const initials = user.name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" className="gap-2 px-1.5" aria-label="User menu" />}>
        <Avatar className="size-7"><AvatarFallback className="bg-gradient-to-br from-[oklch(0.86_0.12_88)] to-[oklch(0.66_0.12_72)] text-xs font-semibold text-[oklch(0.2_0.03_70)]">{initials}</AvatarFallback></Avatar>
        <span className="hidden text-sm sm:inline">{user.name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5 text-xs text-muted-foreground">
          <div className="truncate">{user.email}</div>
          <div>{ROLE_LABELS[user.role]}</div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/profile")}><UserIcon /> Profile</DropdownMenuItem>
        <DropdownMenuItem
          onClick={async () => {
            await logoutAction();
            router.replace("/login");
            router.refresh();
          }}
        >
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ user, projects, activeProjectId, children }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try { setCollapsed(localStorage.getItem("sidebar-collapsed") === "1"); } catch {}
  }, []);
  const toggle = () =>
    setCollapsed((c) => {
      try { localStorage.setItem("sidebar-collapsed", c ? "0" : "1"); } catch {}
      return !c;
    });

  const [mobileOpen, setMobileOpen] = useState(false);
  const visibleNav = NAV.filter((n) => (n.href !== "/users" || user.role === "ADMIN") && (!n.minRole || hasRole(user.role, n.minRole)));

  return (
    <div className="flex min-h-screen">
      <aside className={cn("print:!hidden sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] md:flex", collapsed ? "w-14" : "w-56")}>
        <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-3">
          {!collapsed && <Logo />}
          <Button variant="ghost" size="icon" className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" onClick={toggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>
        </div>
        <nav aria-label="Main" className={cn("flex-1 overflow-y-auto p-2", !collapsed && "p-3 pl-4")}>
          {groupNav(visibleNav).map((g, i) => (
            <div key={g.label} className={cn("space-y-1", i > 0 && (collapsed ? "mt-3 border-t border-sidebar-border pt-3" : "mt-5"))}>
              {!collapsed && <p className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-widest text-sidebar-foreground/40">{g.label}</p>}
              {g.items.map(({ href, label, icon: Icon, exact }) => {
                const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
                return (
                  <Link
                    key={href}
                    href={href}
                    title={collapsed ? label : undefined}
                    aria-current={active ? "page" : undefined}
                    className={cn(NAV_LINK, active && NAV_ACTIVE, collapsed && "justify-center px-0")}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    {!collapsed && <span className="truncate">{label}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="print:hidden sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-md">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger render={<Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation" />}>
              <Menu />
            </SheetTrigger>
            <SheetContent side="left" className="w-64 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground">
              <SheetTitle className="border-b border-sidebar-border px-4 py-3 text-sidebar-foreground"><Logo /></SheetTitle>
              <nav aria-label="Mobile" className="overflow-y-auto p-2">
                {groupNav(visibleNav).map((g, i) => (
                  <div key={g.label} className={cn("space-y-0.5", i > 0 && "mt-4")}>
                    <p className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-widest text-sidebar-foreground/40">{g.label}</p>
                    {g.items.map(({ href, label, icon: Icon, exact }) => {
                      const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
                      return (
                        <Link
                          key={href}
                          href={href}
                          onClick={() => setMobileOpen(false)}
                          aria-current={active ? "page" : undefined}
                          className={cn(NAV_LINK, active && NAV_ACTIVE)}
                        >
                          <Icon className="size-4 shrink-0" aria-hidden />
                          <span>{label}</span>
                        </Link>
                      );
                    })}
                  </div>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
          <ProjectSwitcher projects={projects} activeId={activeProjectId} />
          <div className="hidden min-w-0 flex-1 lg:block"><Breadcrumbs /></div>
          <div className="ml-auto flex items-center gap-1">
            <GlobalSearch />
            <ThemeToggle />
            <NotificationBell />
            <UserMenu user={user} />
          </div>
        </header>
        <main className="flex-1 p-4 md:p-8 2xl:p-10"><div className="mx-auto w-full max-w-[110rem]">{children}</div></main>
      </div>
    </div>
  );
}
