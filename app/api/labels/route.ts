import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBoardMember } from "@/lib/auth-guard";
import { LABEL_COLORS } from "@/lib/constants";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { boardId?: string; name?: string; color?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  const boardId = body.boardId;
  const name = body.name?.trim();
  const color = body.color?.trim();
  if (!boardId || !name) {
    return NextResponse.json({ error: "boardId et name requis" }, { status: 400 });
  }
  if (!color || !LABEL_COLORS.some((c) => c.value === color)) {
    return NextResponse.json({ error: "Couleur invalide" }, { status: 400 });
  }

  const auth = await requireBoardMember(req, boardId);
  if ("error" in auth) return auth.error;

  const label = await prisma.label.create({ data: { boardId, name, color } });
  return NextResponse.json({ label }, { status: 201 });
}