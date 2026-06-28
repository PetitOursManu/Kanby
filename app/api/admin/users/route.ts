import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { hashPassword } from "@/lib/auth/passwords";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      displayName: true,
      avatarUrl: true,
      globalRole: true,
      active: true,
      createdAt: true,
      _count: { select: { ownedBoards: true, apiTokens: true } },
    },
  });
  return NextResponse.json({ users });
}

/** Create a new user. Body: { email, displayName, password, globalRole? }. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  let body: { email?: string; displayName?: string; password?: string; globalRole?: "USER" | "ADMIN" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const displayName = body.displayName?.trim();
  const password = body.password;

  if (!email || !displayName || !password) {
    return NextResponse.json({ error: "email, displayName et password requis" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Le mot de passe doit faire au moins 6 caractères" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Un compte existe déjà avec cet email" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      displayName,
      passwordHash,
      globalRole: body.globalRole === "ADMIN" ? "ADMIN" : "USER",
      mustChangePwd: true,
    },
    select: {
      id: true, email: true, displayName: true, globalRole: true, active: true, createdAt: true,
      _count: { select: { ownedBoards: true, apiTokens: true } },
    },
  });
  return NextResponse.json({ user }, { status: 201 });
}

/** Activate/deactivate a user. Body: { userId, active }. */
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  let body: { userId?: string; active?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  if (!body.userId || typeof body.active !== "boolean") {
    return NextResponse.json({ error: "userId et active requis" }, { status: 400 });
  }

  // Never deactivate yourself.
  if (body.userId === auth.user.id && !body.active) {
    return NextResponse.json({ error: "Vous ne pouvez pas vous désactiver" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: body.userId },
    data: { active: body.active },
    select: { id: true, active: true },
  });
  return NextResponse.json({ user });
}