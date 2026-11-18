import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBoardOwner, requireBoardMember } from "@/lib/auth-guard";
import { LABEL_COLORS } from "@/lib/constants";
import { LIMITS, badRequest, notFound, readJson, text } from "@/lib/validation";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const label = await prisma.label.findUnique({ where: { id: params.id } });
  if (!label) return notFound("Étiquette introuvable");
  const auth = await requireBoardMember(req, label.boardId);
  if ("error" in auth) return auth.error;

  const body = await readJson<{ name: string; color: string }>(req);
  if (!body) return badRequest("Requête invalide");

  const data: { name?: string; color?: string } = {};
  const name = text(body.name, LIMITS.labelName);
  if (name.error) return badRequest(name.error === "too_long" ? "Nom trop long" : "Nom requis");
  if (name.value) data.name = name.value;
  if (body.color !== undefined) {
    if (!LABEL_COLORS.some((c) => c.value === body.color)) return badRequest("Couleur invalide");
    data.color = body.color;
  }

  const updated = await prisma.label.update({ where: { id: params.id }, data });
  return NextResponse.json({ label: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const label = await prisma.label.findUnique({ where: { id: params.id } });
  if (!label) return notFound("Étiquette introuvable");
  const auth = await requireBoardOwner(req, label.boardId);
  if ("error" in auth) return auth.error;
  await prisma.label.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
