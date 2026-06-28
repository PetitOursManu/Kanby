import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/passwords";
import { createApiToken } from "@/lib/auth/token";

export const runtime = "nodejs";

/**
 * POST /api/auth/token
 * Exchange email + password for an API token (mobile login).
 * Unlike /api/auth/login, this does NOT set a cookie — the client stores
 * the returned token and sends it as `Authorization: Bearer kbt_...`.
 *
 * Request body:  { email, password, label? }
 * Response 200:  { token: "kbt_...", user: { id, email, displayName, globalRole, mustChangePwd } }
 * Response 401:  { error: "Identifiants invalides" }
 */
export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string; label?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";
  if (!email || !password) {
    return NextResponse.json({ error: "Email et mot de passe requis" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) {
    return NextResponse.json({ error: "Identifiants invalides" }, { status: 401 });
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Identifiants invalides" }, { status: 401 });
  }

  const label = body.label?.trim() || "Mobile API";
  const { raw } = await createApiToken(user.id, label);

  return NextResponse.json({
    token: raw,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      globalRole: user.globalRole,
      mustChangePwd: user.mustChangePwd,
    },
  });
}