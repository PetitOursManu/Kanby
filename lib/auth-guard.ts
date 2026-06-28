import { NextRequest, NextResponse } from "next/server";
import type { User } from "@prisma/client";
import { resolveUserFromRequest } from "@/lib/auth/unified";
import { prisma } from "@/lib/prisma";

export type AuthOk = { user: User };
export type AuthErr = { error: NextResponse };
export type AuthResult = AuthOk | AuthErr;

function unauthorized(message = "Non authentifié"): NextResponse {
  return NextResponse.json({ error: message }, { status: 401 });
}
function forbidden(message = "Accès refusé"): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}

/** Require a valid session. Returns the user or a 401 response. */
export async function requireUser(req: NextRequest): Promise<AuthResult> {
  const user = await resolveUserFromRequest(req);
  if (!user) return { error: unauthorized() };
  return { user };
}

/** Require a valid session AND an admin role. Returns user or 401/403. */
export async function requireAdmin(req: NextRequest): Promise<AuthResult> {
  const user = await resolveUserFromRequest(req);
  if (!user) return { error: unauthorized() };
  if (user.globalRole !== "ADMIN") return { error: forbidden() };
  return { user };
}

/**
 * Require that the user is a member of the given board (owner counts as
 * member). Returns the user and the board, or 401/403/404.
 */
export async function requireBoardMember(
  req: NextRequest,
  boardId: string,
): Promise<
  | { user: User; board: Awaited<ReturnType<typeof prisma.board.findUnique>> }
  | { error: NextResponse }
> {
  const user = await resolveUserFromRequest(req);
  if (!user) return { error: unauthorized() };
  const board = await prisma.board.findUnique({ where: { id: boardId } });
  if (!board) return { error: NextResponse.json({ error: "Tableau introuvable" }, { status: 404 }) };

  const isOwner = board.ownerId === user.id;
  const isMember =
    isOwner ||
    (await prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId: user.id } },
    })) !== null;

  // Admins can view any board but are not treated as members for editing.
  if (!isMember && user.globalRole !== "ADMIN") {
    return { error: forbidden() };
  }
  return { user, board };
}

/** Require that the user is the owner of the board (or an admin). */
export async function requireBoardOwner(
  req: NextRequest,
  boardId: string,
): Promise<
  | { user: User; board: Awaited<ReturnType<typeof prisma.board.findUnique>> }
  | { error: NextResponse }
> {
  const user = await resolveUserFromRequest(req);
  if (!user) return { error: unauthorized() };
  const board = await prisma.board.findUnique({ where: { id: boardId } });
  if (!board) return { error: NextResponse.json({ error: "Tableau introuvable" }, { status: 404 }) };
  if (board.ownerId !== user.id && user.globalRole !== "ADMIN") {
    return { error: forbidden("Seul le propriétaire peut effectuer cette action") };
  }
  return { user, board };
}