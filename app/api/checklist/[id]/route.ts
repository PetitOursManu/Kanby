import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBoardMember } from "@/lib/auth-guard";

export const runtime = "nodejs";

async function resolveItem(req: NextRequest, id: string) {
  const item = await prisma.checklistItem.findUnique({
    where: { id },
    include: { card: { select: { boardId: true } } },
  });
  if (!item) return null;
  const auth = await requireBoardMember(req, item.card.boardId);
  if ("error" in auth) return { error: auth.error };
  return { item, ...auth };
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveItem(req, params.id);
  if (!ctx) return NextResponse.json({ error: "Élément introuvable" }, { status: 404 });
  if ("error" in ctx) return ctx.error;

  let body: { text?: string; done?: boolean; order?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const data: { text?: string; done?: boolean; order?: number } = {};
  if (typeof body.text === "string" && body.text.trim()) data.text = body.text.trim();
  if (typeof body.done === "boolean") data.done = body.done;
  if (typeof body.order === "number") data.order = body.order;

  const item = await prisma.checklistItem.update({ where: { id: params.id }, data });
  return NextResponse.json({ item });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveItem(req, params.id);
  if (!ctx) return NextResponse.json({ error: "Élément introuvable" }, { status: 404 });
  if ("error" in ctx) return ctx.error;
  await prisma.checklistItem.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}