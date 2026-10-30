"use server";
import { z } from "zod";
import { run } from "@/lib/server/action";
import { requireUser } from "@/lib/server/dal";
import * as svc from "@/lib/server/services/notifications";

export async function listNotificationsAction(page = 1) {
  return run(null, null, async () => svc.listNotifications(await requireUser(), z.number().int().min(1).max(10_000).parse(page)));
}

export async function deleteNotificationAction(id) {
  return run(null, null, async () => svc.deleteNotification(await requireUser(), z.string().uuid().parse(id)));
}

export async function markNotificationReadAction(id) {
  return run(null, null, async () => svc.markNotificationRead(await requireUser(), z.string().uuid().parse(id)));
}

export async function markAllNotificationsReadAction() {
  return run(null, null, async () => svc.markAllNotificationsRead(await requireUser()));
}
