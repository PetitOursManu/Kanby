import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { hashPassword, isPasswordValid } from "@/lib/auth/passwords";
import { EMAIL_RE, LIMITS, badRequest, notFound, readJson, text } from "@/lib/validation";

export const runtime = "nodejs";

const USER_SELECT = {
  id: true,
  email: true,
  displayName: true,
  avatarUrl: true,
  globalRole: true,
  active: true,
  createdAt: true,
  _count: { select: { ownedBoards: true, apiTokens: true } },
} as const;

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" }, select: USER_SELECT });
  return NextResponse.json({ users });
}

/** Create a new user. Body: { email, displayName, password, globalRole? }. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const body = await readJson<{ email: string; displayName: string; password: string; globalRole: "USER" | "ADMIN" }>(req);
  if (!body) return badRequest("Requête invalide");

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const displayName = text(body.displayName, LIMITS.displayName, { required: true });
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || displayName.error || !password) return badRequest("email, displayName et password requis");
  if (!EMAIL_RE.test(email) || email.length > LIMITS.email) return badRequest("Email invalide");
  if (!isPasswordValid(password)) return badRequest("Le mot de passe doit faire au moins 8 caractères");

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return NextResponse.json({ error: "Un compte existe déjà avec cet email" }, { status: 409 });

  const user = await prisma.user.create({
    data: {
      email,
      displayName: displayName.value!,
      passwordHash: await hashPassword(password),
      globalRole: body.globalRole === "ADMIN" ? "ADMIN" : "USER",
      mustChangePwd: true,
    },
    select: USER_SELECT,
  });
  return NextResponse.json({ user }, { status: 201 });
}

/**
 * Update a user. Body: { userId, active?, globalRole?, password? }.
 *  - active: enable / disable the account (never yourself)
 *  - globalRole: "USER" | "ADMIN" (you can't demote yourself)
 *  - password: set a temporary password; the user must change it at next login
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const body = await readJson<{ userId: string; active: boolean; globalRole: "USER" | "ADMIN"; password: string }>(req);
  if (!body || typeof body.userId !== "string") return badRequest("userId requis");

  const target = await prisma.user.findUnique({ where: { id: body.userId } });
  if (!target) return notFound("Utilisateur introuvable");
  const self = target.id === auth.user.id;

  const data: { active?: boolean; globalRole?: "USER" | "ADMIN"; passwordHash?: string; mustChangePwd?: boolean } = {};
  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") return badRequest("active invalide");
    if (self && !body.active) return badRequest("Vous ne pouvez pas vous désactiver");
    data.active = body.active;
  }
  if (body.globalRole !== undefined) {
    if (body.globalRole !== "USER" && body.globalRole !== "ADMIN") return badRequest("Rôle invalide");
    if (self && body.globalRole !== "ADMIN") return badRequest("Vous ne pouvez pas retirer vos propres droits d'administration");
    data.globalRole = body.globalRole;
  }
  if (body.password !== undefined) {
    if (typeof body.password !== "string" || !isPasswordValid(body.password)) {
      return badRequest("Le mot de passe doit faire au moins 8 caractères");
    }
    data.passwordHash = await hashPassword(body.password);
    data.mustChangePwd = true;
  }
  if (Object.keys(data).length === 0) return badRequest("Rien à modifier");

  const user = await prisma.user.update({ where: { id: target.id }, data, select: USER_SELECT });
  return NextResponse.json({ user });
}
