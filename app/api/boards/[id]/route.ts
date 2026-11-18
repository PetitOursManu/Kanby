import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBoardMember, requireBoardOwner } from "@/lib/auth-guard";
import { FULL_BOARD_INCLUDE } from "@/lib/board-queries";
import { LIMITS, badRequest, readJson, text } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireBoardMember(req, params.id, "read");
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

  const body = await readJson<{ name: string; type: "PERSONAL" | "TEAM" }>(req);
  if (!body) return badRequest("Requête invalide");

  const data: { name?: string; type?: "PERSONAL" | "TEAM" } = {};
  const name = text(body.name, LIMITS.boardName);
  if (name.error) return badRequest(name.error === "too_long" ? "Nom trop long" : "Nom requis");
  if (name.value) data.name = name.value;
  if (body.type !== undefined) {
    if (body.type !== "PERSONAL" && body.type !== "TEAM") return badRequest("Type invalide");
    data.type = body.type;
  }

  const ownerId = auth.board.ownerId;
  const board = await prisma.$transaction(async (tx) => {
    if (data.type === "TEAM") {
      // Promoting a personal board to team: the owner becomes its first member.
      await tx.boardMember.upsert({
        where: { boardId_userId: { boardId: params.id, userId: ownerId } },
        update: { role: "OWNER" },
        create: { boardId: params.id, userId: ownerId, role: "OWNER" },
      });
    } else if (data.type === "PERSONAL") {
      // A personal board is private again: other members lose access and
      // their assignments on the board are cleared.
      const others = await tx.boardMember.findMany({
        where: { boardId: params.id, userId: { not: ownerId } },
        select: { userId: true },
      });
      const ids = others.map((o) => o.userId);
      if (ids.length) {
        await tx.card.updateMany({ where: { boardId: params.id, assigneeId: { in: ids } }, data: { assigneeId: null } });
      }
      await tx.boardMember.deleteMany({ where: { boardId: params.id } });
    }
    return tx.board.update({ where: { id: params.id }, data });
  });
  return NextResponse.json({ board });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireBoardOwner(req, params.id);
  if ("error" in auth) return auth.error;
  await prisma.board.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
