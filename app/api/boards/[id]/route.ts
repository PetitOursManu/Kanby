import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBoardMember, requireBoardOwner } from "@/lib/auth-guard";
import { FULL_BOARD_INCLUDE } from "@/lib/board-queries";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireBoardMember(req, params.id);
  if ("error" in auth) return auth.error;
  const board = await prisma.board.findUnique({
    where: { id: params.id },
    include: FULL_BOARD_INCLUDE,
  });
  if (!board) return NextResponse.json({ error: "Tableau introuvable" }, { status: 404 });
  return NextResponse.json({ board });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireBoardOwner(req, params.id);
  if ("error" in auth) return auth.error;

  let body: { name?: string; type?: "PERSONAL" | "TEAM" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const data: { name?: string; type?: "PERSONAL" | "TEAM" } = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (body.type === "PERSONAL" || body.type === "TEAM") data.type = body.type;

  // Promoting a personal board to team creates an owner membership if missing.
  if (data.type === "TEAM") {
    const existing = await prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId: params.id, userId: auth.board!.ownerId } },
    });
    if (!existing) {
      await prisma.boardMember.create({
        data: { boardId: params.id, userId: auth.board!.ownerId, role: "OWNER" },
      });
    }
  }

  const board = await prisma.board.update({ where: { id: params.id }, data });
  return NextResponse.json({ board });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireBoardOwner(req, params.id);
  if ("error" in auth) return auth.error;
  await prisma.board.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}