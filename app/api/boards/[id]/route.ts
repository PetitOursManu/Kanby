import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBoardMember, requireBoardOwner } from "@/lib/auth-guard";
import { FULL_BOARD_INCLUDE } from "@/lib/board-queries";
import { calendarFamilyIds } from "@/lib/calendar-boards";
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
    // Day / week boards follow the type of their board.
    if (auth.board.parentId) return badRequest("Le type se règle sur le tableau principal");
    data.type = body.type;
  }

  const ownerId = auth.board.ownerId;
  // A type change applies to the board and to every board of its calendar.
  const familyIds = data.type ? await calendarFamilyIds(params.id) : [params.id];
  const board = await prisma.$transaction(async (tx) => {
    if (data.type === "TEAM") {
      // Promoting a personal board to team: the owner becomes its first member.
      for (const boardId of familyIds) {
        await tx.boardMember.upsert({
          where: { boardId_userId: { boardId, userId: ownerId } },
          update: { role: "OWNER" },
          create: { boardId, userId: ownerId, role: "OWNER" },
        });
      }
    } else if (data.type === "PERSONAL") {
      // A personal board is private again: other members lose access and
      // their assignments on the board are cleared.
      const others = await tx.boardMember.findMany({
        where: { boardId: { in: familyIds }, userId: { not: ownerId } },
        select: { userId: true },
      });
      const ids = Array.from(new Set(others.map((o) => o.userId)));
      if (ids.length) {
        await tx.card.updateMany({ where: { boardId: { in: familyIds }, assigneeId: { in: ids } }, data: { assigneeId: null } });
      }
      await tx.boardMember.deleteMany({ where: { boardId: { in: familyIds } } });
    }
    if (data.type && familyIds.length > 1) {
      await tx.board.updateMany({ where: { parentId: params.id }, data: { type: data.type } });
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
