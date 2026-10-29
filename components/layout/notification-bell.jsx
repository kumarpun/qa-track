"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AtSign, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { listNotificationsAction, markAllNotificationsReadAction, markNotificationReadAction } from "@/app/actions/notifications";
import { ago } from "@/components/comments/format";

const POLL_MS = 60_000;
const MIN_GAP_MS = 20_000; // navigation refresh at most this often

/** Header bell: unread count + latest notifications (@mentions). Clicking one marks it read and opens the page it points to. */
export function NotificationBell() {
  const router = useRouter();
  const pathname = usePathname();
  const [data, setData] = useState({ unread: 0, items: [] });
  const lastLoad = useRef(0);

  // Reading `mounted` instead of a per-effect flag keeps a response that lands after a pathname change (or a dev double-mount).
  const mounted = useRef(true);
  const load = useCallback(async () => {
    lastLoad.current = Date.now();
    const res = await listNotificationsAction().catch(() => null);
    if (mounted.current && res?.ok) setData(res.data);
  }, []);
  useEffect(() => {
    mounted.current = true;
    const t = setInterval(load, POLL_MS);
    return () => { mounted.current = false; clearInterval(t); };
  }, [load]);
  // On navigation refresh only when the last fetch is old, so clicking around does not queue extra server actions.
  useEffect(() => {
    if (Date.now() - lastLoad.current > MIN_GAP_MS) load();
  }, [pathname, load]);

  const open = async (n) => {
    if (!n.read) {
      setData((d) => ({ unread: Math.max(0, d.unread - 1), items: d.items.map((x) => (x.id === n.id ? { ...x, read: true } : x)) }));
      await markNotificationReadAction(n.id).catch(() => {});
    }
    router.push(n.href);
  };
  const readAll = async () => {
    setData((d) => ({ unread: 0, items: d.items.map((x) => ({ ...x, read: true })) }));
    await markAllNotificationsReadAction().catch(() => {});
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={data.unread ? `Notifications (${data.unread} unread)` : "Notifications"} className="relative" />}>
        <Bell />
        {data.unread > 0 && (
          <span data-testid="notification-count" className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium leading-4 text-white">
            {data.unread > 9 ? "9+" : data.unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 max-w-[calc(100vw-2rem)]">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-sm font-medium">Notifications</span>
          {data.unread > 0 && <button type="button" onClick={readAll} className="text-xs text-muted-foreground hover:text-foreground">Mark all read</button>}
        </div>
        {data.items.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">No notifications yet. You will see @mentions here.</p>
        ) : (
          <div className="max-h-96 overflow-auto" data-testid="notification-list">
            {data.items.map((n) => (
              <DropdownMenuItem key={n.id} onClick={() => open(n)} className="items-start gap-2 py-2" data-testid="notification">
                <AtSign className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 space-y-0.5">
                  <span className={`block text-sm ${n.read ? "" : "font-medium"}`}><b>{n.actor}</b> mentioned you</span>
                  <span className="block truncate text-xs text-muted-foreground">{n.snippet}</span>
                  <span className="block truncate text-xs text-muted-foreground">{n.label} · {ago(n.at)}</span>
                </span>
                {!n.read && <span aria-label="Unread" className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
              </DropdownMenuItem>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
