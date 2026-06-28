import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBoardMember } from "@/lib/auth-guard";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { columnId?: string; title?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  const columnId = body.columnId;
  const title = body.title?.trim();
  if (!columnId || !title) {
    return NextResponse.json({ error: "columnId et title requis" }, { status: 400 });
  }

  const column = await prisma.column.findUnique({ where: { id: columnId } });
  if (!column) return NextResponse.json({ error: "Colonne introuvable" }, { status: 404 });

  const auth = await requireBoardMember(req, column.boardId);
  if ("error" in auth) return auth.error;

  const maxOrder = await prisma.card.aggregate({
    where: { columnId },
    _max: { order: true },
  });
  const order = (maxOrder._max.order ?? -1) + 1;

  const card = await prisma.card.create({
    data: { columnId, boardId: column.boardId, title, order },
    include: {
      labels: { include: { label: true } },
      assignee: { select: { id: true, displayName: true, avatarUrl: true } },
      checklist: { select: { done: true } },
      _count: { select: { checklist: true, comments: true } },
    },
  });
  return NextResponse.json({ card }, { status: 201 });
}