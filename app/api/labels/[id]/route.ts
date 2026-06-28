import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBoardOwner, requireBoardMember } from "@/lib/auth-guard";
import { LABEL_COLORS } from "@/lib/constants";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const label = await prisma.label.findUnique({ where: { id: params.id } });
  if (!label) return NextResponse.json({ error: "Étiquette introuvable" }, { status: 404 });
  const auth = await requireBoardMember(req, label.boardId);
  if ("error" in auth) return auth.error;

  let body: { name?: string; color?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const data: { name?: string; color?: string } = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (body.color && LABEL_COLORS.some((c) => c.value === body.color)) data.color = body.color;

  const updated = await prisma.label.update({ where: { id: params.id }, data });
  return NextResponse.json({ label: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const label = await prisma.label.findUnique({ where: { id: params.id } });
  if (!label) return NextResponse.json({ error: "Étiquette introuvable" }, { status: 404 });
  const auth = await requireBoardOwner(req, label.boardId);
  if ("error" in auth) return auth.error;
  await prisma.label.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}