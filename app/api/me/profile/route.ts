import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-guard";

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
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  let body: { displayName?: string; avatarUrl?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const data: { displayName?: string; avatarUrl?: string | null } = {};
  if (typeof body.displayName === "string" && body.displayName.trim().length > 0) {
    data.displayName = body.displayName.trim();
  }
  if (body.avatarUrl === null || typeof body.avatarUrl === "string") {
    data.avatarUrl = body.avatarUrl;
  }

  const updated = await prisma.user.update({
    where: { id: auth.user.id },
    data,
    select: { id: true, email: true, displayName: true, avatarUrl: true, globalRole: true },
  });
  return NextResponse.json(updated);
}