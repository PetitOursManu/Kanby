import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBoardMember } from "@/lib/auth-guard";
import { LIMITS, badRequest, notFound, readJson, text } from "@/lib/validation";

export const runtime = "nodejs";

async function resolveItem(req: NextRequest, id: string) {
  const item = await prisma.checklistItem.findUnique({
    where: { id },
    include: { card: { select: { boardId: true } } },
  });
  if (!item) return { error: notFound("Élément introuvable") };
  const auth = await requireBoardMember(req, item.card.boardId);
  if ("error" in auth) return { error: auth.error };
  return { item, ...auth };
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveItem(req, params.id);
  if ("error" in ctx) return ctx.error;

  const body = await readJson<{ text: string; done: boolean; order: number }>(req);
  if (!body) return badRequest("Requête invalide");

  const data: { text?: string; done?: boolean; order?: number } = {};
  const t = text(body.text, LIMITS.checklistText);
  if (t.error) return badRequest(t.error === "too_long" ? "Texte trop long" : "Texte requis");
  if (t.value) data.text = t.value;
  if (typeof body.done === "boolean") data.done = body.done;
  if (typeof body.order === "number" && Number.isFinite(body.order)) data.order = Math.max(0, Math.floor(body.order));

  const item = await prisma.checklistItem.update({ where: { id: params.id }, data });
  return NextResponse.json({ item });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveItem(req, params.id);
  if ("error" in ctx) return ctx.error;
  await prisma.checklistItem.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
