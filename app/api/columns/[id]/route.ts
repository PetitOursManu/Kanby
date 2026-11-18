import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBoardMember, requireBoardOwner } from "@/lib/auth-guard";
import { notifyBoardMembers } from "@/lib/notify";
import { compactColumns, moveColumn } from "@/lib/ordering";
import { HEX_COLOR_RE, LIMITS, badRequest, index, notFound, readJson, text } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * Edit a column: `name`, `kind`, `color`, and `order` (= target index; the
 * other columns are shifted so positions stay 0..n-1).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const column = await prisma.column.findUnique({ where: { id: params.id } });
  if (!column) return notFound("Colonne introuvable");
  const auth = await requireBoardMember(req, column.boardId);
  if ("error" in auth) return auth.error;

  const body = await readJson<{ name: string; kind: "TODO" | "DOING" | "DONE"; order: number; color: string | null }>(req);
  if (!body) return badRequest("Requête invalide");

  const data: { name?: string; kind?: "TODO" | "DOING" | "DONE"; color?: string | null } = {};
  const name = text(body.name, LIMITS.columnName);
  if (name.error) return badRequest(name.error === "too_long" ? "Nom trop long" : "Nom requis");
  if (name.value) data.name = name.value;
  if (body.kind !== undefined) {
    if (body.kind !== "TODO" && body.kind !== "DOING" && body.kind !== "DONE") return badRequest("Type invalide");
    data.kind = body.kind;
  }
  if (body.color !== undefined) {
    if (body.color === null || body.color === "") data.color = null;
    else if (typeof body.color === "string" && HEX_COLOR_RE.test(body.color)) data.color = body.color;
    else return badRequest("Couleur invalide");
  }

  await prisma.$transaction(async (tx) => {
    await tx.column.update({ where: { id: params.id }, data });
    // Keep card completion in sync with the column's kind.
    if (data.kind && data.kind !== column.kind) {
      if (data.kind === "DONE") {
        await tx.card.updateMany({ where: { columnId: params.id, completedAt: null }, data: { completedAt: new Date() } });
      } else if (column.kind === "DONE") {
        await tx.card.updateMany({ where: { columnId: params.id }, data: { completedAt: null } });
      }
    }
  });
  const target = index(body.order);
  if (target !== undefined) await moveColumn(params.id, target);

  const updated = await prisma.column.findUniqueOrThrow({ where: { id: params.id } });
  return NextResponse.json({ column: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  // Only the board owner can delete columns (their cards are deleted too).
  const column = await prisma.column.findUnique({ where: { id: params.id } });
  if (!column) return notFound("Colonne introuvable");
  const auth = await requireBoardOwner(req, column.boardId);
  if ("error" in auth) return auth.error;
  await prisma.column.delete({ where: { id: params.id } });
  await compactColumns(column.boardId);

  await notifyBoardMembers({
    req,
    boardId: column.boardId,
    actorId: auth.user.id,
    kind: "column_deleted",
    messageKey: "notif.column_deleted",
  });

  return NextResponse.json({ ok: true });
}
