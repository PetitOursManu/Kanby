import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBoardMember, requireBoardOwner, requireUser } from "@/lib/auth-guard";
import { notifyBoardMembers, notifyUser } from "@/lib/notify";
import { badRequest, notFound, readJson } from "@/lib/validation";

export const runtime = "nodejs";

const USER_SELECT = { id: true, displayName: true, email: true, avatarUrl: true } as const;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireBoardMember(req, params.id, "read");
  if ("error" in auth) return auth.error;

  const members = await prisma.boardMember.findMany({
    where: { boardId: params.id },
    orderBy: { joinedAt: "asc" },
    include: { user: { select: USER_SELECT } },
  });
  return NextResponse.json({ members });
}

/** Invite a user by userId or email. Owner only, team boards only. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireBoardOwner(req, params.id);
  if ("error" in auth) return auth.error;

  const body = await readJson<{ userId: string; email: string }>(req);
  if (!body) return badRequest("Requête invalide");

  if (auth.board.type !== "TEAM") {
    return badRequest("Seuls les tableaux d'équipe peuvent être partagés");
  }

  let target: { id: string; active: boolean } | null = null;
  if (typeof body.userId === "string" && body.userId) {
    target = await prisma.user.findUnique({ where: { id: body.userId }, select: { id: true, active: true } });
  } else if (typeof body.email === "string" && body.email.trim()) {
    target = await prisma.user.findUnique({
      where: { email: body.email.trim().toLowerCase() },
      select: { id: true, active: true },
    });
  } else {
    return badRequest("userId ou email requis");
  }
  if (!target || !target.active) return notFound("Utilisateur introuvable");

  if (auth.board.ownerId === target.id) {
    return badRequest("Le propriétaire est déjà membre");
  }

  const existing = await prisma.boardMember.findUnique({
    where: { boardId_userId: { boardId: params.id, userId: target.id } },
  });
  const member = await prisma.boardMember.upsert({
    where: { boardId_userId: { boardId: params.id, userId: target.id } },
    update: {},
    create: { boardId: params.id, userId: target.id, role: "MEMBER" },
    include: { user: { select: USER_SELECT } },
  });

  if (!existing) {
    await notifyUser({
      req,
      userId: target.id,
      actorId: auth.user.id,
      boardId: params.id,
      kind: "member_added",
      messageKey: "notif.member_added",
    });
  }

  return NextResponse.json({ member }, { status: 201 });
}

/**
 * Remove a member (`?userId=`). The owner can remove anyone but themself;
 * any member can remove themself (leave the board).
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return badRequest("userId requis");

  const me = await requireUser(req);
  if ("error" in me) return me.error;
  const leaving = userId === me.user.id;

  const auth = leaving ? await requireBoardMember(req, params.id) : await requireBoardOwner(req, params.id);
  if ("error" in auth) return auth.error;
  if (userId === auth.board.ownerId) {
    return badRequest("Impossible de retirer le propriétaire");
  }

  await prisma.$transaction([
    prisma.card.updateMany({ where: { boardId: params.id, assigneeId: userId }, data: { assigneeId: null } }),
    prisma.boardMember.deleteMany({ where: { boardId: params.id, userId } }),
  ]);

  if (!leaving) {
    await notifyUser({
      req,
      userId,
      actorId: auth.user.id,
      boardId: params.id,
      kind: "member_removed",
      messageKey: "notif.member_removed",
    });
  } else {
    await notifyBoardMembers({
      req,
      boardId: params.id,
      actorId: auth.user.id,
      kind: "member_removed",
      messageKey: "notif.member_left",
    });
  }

  return NextResponse.json({ ok: true });
}
