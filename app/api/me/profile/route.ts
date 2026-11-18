import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-guard";
import { LIMITS, badRequest, isSafeImageUrl, readJson, text } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  const u = auth.user;
  return NextResponse.json({
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    globalRole: u.globalRole,
    mustChangePwd: u.mustChangePwd,
    locale: u.locale,
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  const body = await readJson<{ displayName: string; avatarUrl: string | null }>(req);
  if (!body) return badRequest("Requête invalide");

  const data: { displayName?: string; avatarUrl?: string | null } = {};
  const name = text(body.displayName, LIMITS.displayName);
  if (name.error) return badRequest(name.error === "too_long" ? "Nom trop long" : "Le nom affiché est requis");
  if (name.value) data.displayName = name.value;
  if (body.avatarUrl !== undefined) {
    if (body.avatarUrl === null || body.avatarUrl === "") data.avatarUrl = null;
    else if (typeof body.avatarUrl === "string" && isSafeImageUrl(body.avatarUrl.trim())) data.avatarUrl = body.avatarUrl.trim();
    else return badRequest("URL d'avatar invalide");
  }

  const updated = await prisma.user.update({
    where: { id: auth.user.id },
    data,
    select: { id: true, email: true, displayName: true, avatarUrl: true, globalRole: true },
  });
  return NextResponse.json(updated);
}
