import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBoardMember } from "@/lib/auth-guard";
import { notifyBoardMembers } from "@/lib/notify";

export const runtime = "nodejs";

async function resolveCard(req: NextRequest, id: string) {
  const card = await prisma.card.findUnique({ where: { id }, select: { boardId: true } });
  if (!card) return null;
  const auth = await requireBoardMember(req, card.boardId);
  if ("error" in auth) return { error: auth.error };
  return { card, ...auth };
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveCard(req, params.id);
  if (!ctx) return NextResponse.json({ error: "Carte introuvable" }, { status: 404 });
  if ("error" in ctx) return ctx.error;

  const card = await prisma.card.findUnique({
    where: { id: params.id },
    include: {
      labels: { include: { label: true } },
      checklist: { orderBy: { order: "asc" } },
      comments: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, displayName: true, avatarUrl: true } } },
      },
      assignee: { select: { id: true, displayName: true, avatarUrl: true } },
      column: { select: { id: true, name: true, kind: true } },
    },
  });
  return NextResponse.json({ card });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveCard(req, params.id);
  if (!ctx) return NextResponse.json({ error: "Carte introuvable" }, { status: 404 });
  if ("error" in ctx) return ctx.error;

  let body: {
    title?: string;
    description?: string | null;
    dueDate?: string | null;
    order?: number;
    columnId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const data: {
    title?: string;
    description?: string | null;
    dueDate?: Date | null;
    order?: number;
    columnId?: string;
    completedAt?: Date | null;
  } = {};

  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
  if (body.description !== undefined) data.description = body.description;
  if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  if (typeof body.order === "number") data.order = body.order;

  // Moving to a different column: validate the target column exists and set
  // or clear completedAt based on the target column's kind.
  if (typeof body.columnId === "string") {
    const targetColumn = await prisma.column.findUnique({ where: { id: body.columnId } });
    if (!targetColumn) return NextResponse.json({ error: "Colonne cible introuvable" }, { status: 404 });
    data.columnId = body.columnId;
    data.completedAt = targetColumn.kind === "DONE" ? new Date() : null;
  }

  const card = await prisma.card.update({ where: { id: params.id }, data });

  // Emit notifications for team boards.
  const movedColumn = typeof body.columnId === "string";
  const updatedFields = body.title !== undefined || body.description !== undefined || body.dueDate !== undefined;
  if (movedColumn) {
    await notifyBoardMembers({
      req,
      boardId: ctx.card.boardId,
      actorId: ctx.user.id,
      cardId: params.id,
      kind: "card_moved",
      messageKey: "notif.card_moved",
      vars: { card: card.title },
    });
  } else if (updatedFields) {
    await notifyBoardMembers({
      req,
      boardId: ctx.card.boardId,
      actorId: ctx.user.id,
      cardId: params.id,
      kind: "card_updated",
      messageKey: "notif.card_updated",
      vars: { card: card.title },
    });
  }

  return NextResponse.json({ card });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveCard(req, params.id);
  if (!ctx) return NextResponse.json({ error: "Carte introuvable" }, { status: 404 });
  if ("error" in ctx) return ctx.error;
  await prisma.card.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}