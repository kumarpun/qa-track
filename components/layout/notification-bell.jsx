"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AtSign, Bell, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { deleteNotificationAction, listNotificationsAction, markAllNotificationsReadAction, markNotificationReadAction } from "@/app/actions/notifications";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ago } from "@/components/comments/format";

const POLL_MS = 60_000;
const MIN_GAP_MS = 20_000; // navigation refresh at most this often

/** Header bell: unread count + notifications (@mentions), 5 per page, newest first. Clicking one marks it read and opens the page it points to; viewed ones stay until deleted. */
export function NotificationBell() {
  const router = useRouter();
  const pathname = usePathname();
  const [data, setData] = useState({ unread: 0, page: 1, pageCount: 1, items: [] });
  const [toDelete, setToDelete] = useState(null);
  const lastLoad = useRef(0);
  const page = useRef(1);

  // Reading `mounted` instead of a per-effect flag keeps a response that lands after a pathname change (or a dev double-mount).
  const mounted = useRef(true);
  const load = useCallback(async (to = page.current) => {
    lastLoad.current = Date.now();
    const res = await listNotificationsAction(to).catch(() => null);
    if (mounted.current && res?.ok) {
      page.current = res.data.page;
      setData(res.data);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const t = setInterval(() => load(), POLL_MS);
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
  const remove = async (n) => {
    await deleteNotificationAction(n.id).catch(() => {});
    await load();
  };
  const readAll = async () => {
    setData((d) => ({ unread: 0, items: d.items.map((x) => ({ ...x, read: true })) }));
    await markAllNotificationsReadAction().catch(() => {});
  };

  return (
    <>
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
              <div key={n.id} className="flex items-start gap-1">
                <DropdownMenuItem onClick={() => open(n)} className="min-w-0 flex-1 items-start gap-2 py-2" data-testid="notification">
                  <AtSign className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 space-y-0.5">
                    <span className={`block text-sm ${n.read ? "" : "font-medium"}`}><b>{n.actor}</b> {n.type === "PROJECT_ADDED" ? "added you to a project" : "mentioned you"}</span>
                    <span className="block truncate text-xs text-muted-foreground">{n.snippet}</span>
                    <span className="block truncate text-xs text-muted-foreground">{n.label} · {ago(n.at)}</span>
                  </span>
                  {!n.read && <span aria-label="Unread" className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
                </DropdownMenuItem>
                <Button variant="ghost" size="icon-sm" className="mt-1.5 shrink-0" aria-label="Delete notification" title="Delete notification" onClick={() => setToDelete(n)}>
                  <Trash2 className="text-muted-foreground" />
                </Button>
              </div>
            ))}
          </div>
        )}
        {data.pageCount > 1 && (
          <div className="flex items-center justify-between border-t px-2 py-1.5 text-xs text-muted-foreground">
            <Button variant="ghost" size="icon-sm" aria-label="Newer notifications" disabled={data.page <= 1} onClick={() => load(data.page - 1)}><ChevronLeft /></Button>
            <span>Page {data.page} of {data.pageCount}</span>
            <Button variant="ghost" size="icon-sm" aria-label="Older notifications" disabled={data.page >= data.pageCount} onClick={() => load(data.page + 1)}><ChevronRight /></Button>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
    <ConfirmDialog
      open={!!toDelete}
      onOpenChange={(o) => !o && setToDelete(null)}
      title="Delete this notification?"
      description="It is removed from your notifications for good. This cannot be undone."
      confirmLabel="Delete"
      onConfirm={() => toDelete && remove(toDelete)}
    />
    </>
  );
}
