import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, isPasswordValid } from "@/lib/auth/passwords";
import { issueSession } from "@/lib/auth/session";
import { rateLimitOr429 } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const limited = rateLimitOr429(req, "register", 5, 60);
  if (limited) return limited;

  let body: { email?: string; password?: string; displayName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";
  const displayName = body.displayName?.trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Email invalide" }, { status: 400 });
  }
  if (!isPasswordValid(password)) {
    return NextResponse.json({ error: "Le mot de passe doit faire au moins 8 caractères" }, { status: 400 });
  }
  if (!displayName || displayName.length < 1) {
    return NextResponse.json({ error: "Le nom affiché est requis" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Un compte existe déjà avec cet email" }, { status: 409 });
  }

  // Fallback admin promotion: the very first registered user becomes admin
  // when AUTO_ADMIN_FIRST is enabled (useful for no-env local dev).
  const promoteFirst = process.env.AUTO_ADMIN_FIRST === "true";
  const userCount = await prisma.user.count();
  const role = promoteFirst && userCount === 0 ? "ADMIN" : "USER";

  const user = await prisma.user.create({
    data: {
      email,
      displayName,
      passwordHash: await hashPassword(password),
      globalRole: role,
    },
  });

  await issueSession(user);
  return NextResponse.json({
    user: { id: user.id, email: user.email, displayName: user.displayName, globalRole: user.globalRole },
  });
}