import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-guard";

export const runtime = "nodejs";

/**
 * GET /api/notifications
 * Returns the current user's notifications, most recent first.
 * Query: ?unreadOnly=true to get only unread notifications.
 */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const unreadOnly = req.nextUrl.searchParams.get("unreadOnly") === "true";

  const notifications = await prisma.notification.findMany({
    where: { userId: auth.user.id, ...(unreadOnly ? { read: false } : {}) },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: {
      actor: { select: { id: true, displayName: true, avatarUrl: true } },
      board: { select: { id: true, name: true } },
      card: { select: { id: true, title: true } },
    },
  });

  const unreadCount = await prisma.notification.count({
    where: { userId: auth.user.id, read: false },
  });

  return NextResponse.json({ notifications, unreadCount });
}

/**
 * POST /api/notifications/read
 * Mark notifications as read. Body: { id?: string } to mark one, or {} to
 * mark all as read.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  if (body.id) {
    await prisma.notification.updateMany({
      where: { id: body.id, userId: auth.user.id },
      data: { read: true },
    });
  } else {
    await prisma.notification.updateMany({
      where: { userId: auth.user.id, read: false },
      data: { read: true },
    });
  }

  return NextResponse.json({ ok: true });
}