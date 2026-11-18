import { NextRequest, NextResponse } from "next/server";
import type { Board, User } from "@prisma/client";
import { resolveUserFromRequest } from "@/lib/auth/unified";
import { prisma } from "@/lib/prisma";

export type AuthOk = { user: User };
export type AuthErr = { error: NextResponse };
export type AuthResult = AuthOk | AuthErr;
export type BoardAuth = { user: User; board: Board; isOwner: boolean } | AuthErr;

function unauthorized(message = "Non authentifié"): NextResponse {
  return NextResponse.json({ error: message }, { status: 401 });
}
function forbidden(message = "Accès refusé"): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}
function boardNotFound(): NextResponse {
  return NextResponse.json({ error: "Tableau introuvable" }, { status: 404 });
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

/** True if the user owns the board or is one of its members. */
export async function isBoardMember(board: Pick<Board, "id" | "ownerId">, userId: string): Promise<boolean> {
  if (board.ownerId === userId) return true;
  const m = await prisma.boardMember.findUnique({
    where: { boardId_userId: { boardId: board.id, userId } },
    select: { id: true },
  });
  return m !== null;
}

/**
 * Require that the user is a member of the given board (the owner counts as
 * a member).
 *
 * `mode: "read"` also lets administrators in, for moderation — they can look
 * at any board, but they are not members and cannot change its content.
 */
export async function requireBoardMember(
  req: NextRequest,
  boardId: string,
  mode: "read" | "write" = "write",
): Promise<BoardAuth> {
  const user = await resolveUserFromRequest(req);
  if (!user) return { error: unauthorized() };
  const board = await prisma.board.findUnique({ where: { id: boardId } });
  if (!board) return { error: boardNotFound() };

  const isOwner = board.ownerId === user.id;
  const member = isOwner || (await isBoardMember(board, user.id));
  if (!member && !(mode === "read" && user.globalRole === "ADMIN")) {
    return { error: forbidden() };
  }
  return { user, board, isOwner };
}

/** Require that the user is the owner of the board (or an admin). */
export async function requireBoardOwner(req: NextRequest, boardId: string): Promise<BoardAuth> {
  const user = await resolveUserFromRequest(req);
  if (!user) return { error: unauthorized() };
  const board = await prisma.board.findUnique({ where: { id: boardId } });
  if (!board) return { error: boardNotFound() };
  const isOwner = board.ownerId === user.id;
  if (!isOwner && user.globalRole !== "ADMIN") {
    return { error: forbidden("Seul le propriétaire peut effectuer cette action") };
  }
  return { user, board, isOwner };
}
