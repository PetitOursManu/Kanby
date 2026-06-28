import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBoardMember, requireBoardOwner } from "@/lib/auth-guard";

export const runtime = "nodejs";

async function getColumnWithBoard(req: NextRequest, id: string) {
  const column = await prisma.column.findUnique({
    where: { id },
    include: { board: true },
  });
  if (!column) return null;
  const auth = await requireBoardMember(req, column.boardId);
  if ("error" in auth) return { error: auth.error };
  return { column, ...auth };
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getColumnWithBoard(req, params.id);
  if (!ctx) return NextResponse.json({ error: "Colonne introuvable" }, { status: 404 });
  if ("error" in ctx) return ctx.error;

  let body: {
    name?: string;
    kind?: "TODO" | "DOING" | "DONE";
    order?: number;
    color?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const data: { name?: string; kind?: "TODO" | "DOING" | "DONE"; order?: number; color?: string | null } = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (body.kind === "TODO" || body.kind === "DOING" || body.kind === "DONE") data.kind = body.kind;
  if (typeof body.order === "number") data.order = body.order;
  if (body.color !== undefined) data.color = body.color || null;

  const column = await prisma.column.update({ where: { id: params.id }, data });
  return NextResponse.json({ column });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  // Only the board owner can delete columns.
  const column = await prisma.column.findUnique({ where: { id: params.id } });
  if (!column) return NextResponse.json({ error: "Colonne introuvable" }, { status: 404 });
  const auth = await requireBoardOwner(req, column.boardId);
  if ("error" in auth) return auth.error;
  await prisma.column.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}