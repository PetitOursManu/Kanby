import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBoardMember } from "@/lib/auth-guard";
import { notifyBoardMembers } from "@/lib/notify";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { boardId?: string; name?: string; kind?: "TODO" | "DOING" | "DONE" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  const boardId = body.boardId;
  const name = body.name?.trim();
  if (!boardId || !name) {
    return NextResponse.json({ error: "boardId et name requis" }, { status: 400 });
  }

  const auth = await requireBoardMember(req, boardId);
  if ("error" in auth) return auth.error;

  const maxOrder = await prisma.column.aggregate({
    where: { boardId },
    _max: { order: true },
  });
  const order = (maxOrder._max.order ?? -1) + 1;
  const kind = body.kind === "DOING" ? "DOING" : body.kind === "DONE" ? "DONE" : "TODO";

  const column = await prisma.column.create({
    data: { boardId, name, kind, order },
    include: {
      cards: {
        orderBy: { order: "asc" },
        include: {
          labels: { include: { label: true } },
          assignee: { select: { id: true, displayName: true, avatarUrl: true } },
          checklist: { select: { done: true } },
          _count: { select: { checklist: true, comments: true } },
        },
      },
    },
  });

  await notifyBoardMembers({
    req,
    boardId,
    actorId: auth.user.id,
    kind: "column_added",
    messageKey: "notif.column_added",
  });

  return NextResponse.json({ column }, { status: 201 });
}