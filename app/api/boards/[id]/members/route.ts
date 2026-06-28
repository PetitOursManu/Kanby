import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBoardMember, requireBoardOwner } from "@/lib/auth-guard";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireBoardMember(req, params.id);
  if ("error" in auth) return auth.error;

  const members = await prisma.boardMember.findMany({
    where: { boardId: params.id },
    include: { user: { select: { id: true, displayName: true, email: true, avatarUrl: true } } },
  });
  return NextResponse.json({ members });
}

/** Invite a user by userId or email. Owner only. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireBoardOwner(req, params.id);
  if ("error" in auth) return auth.error;

  let body: { userId?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  let userId = body.userId;
  if (!userId && body.email) {
    const u = await prisma.user.findUnique({ where: { email: body.email.trim().toLowerCase() } });
    if (!u) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
    userId = u.id;
  }
  if (!userId) return NextResponse.json({ error: "userId ou email requis" }, { status: 400 });

  if (auth.board!.ownerId === userId) {
    return NextResponse.json({ error: "Le propriétaire est déjà membre" }, { status: 400 });
  }

  const member = await prisma.boardMember.upsert({
    where: { boardId_userId: { boardId: params.id, userId } },
    update: {},
    create: { boardId: params.id, userId, role: "MEMBER" },
    include: { user: { select: { id: true, displayName: true, email: true, avatarUrl: true } } },
  });
  return NextResponse.json({ member }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireBoardOwner(req, params.id);
  if ("error" in auth) return auth.error;

  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId requis" }, { status: 400 });
  if (userId === auth.board!.ownerId) {
    return NextResponse.json({ error: "Impossible de retirer le propriétaire" }, { status: 400 });
  }

  await prisma.boardMember.deleteMany({ where: { boardId: params.id, userId } });
  return NextResponse.json({ ok: true });
}