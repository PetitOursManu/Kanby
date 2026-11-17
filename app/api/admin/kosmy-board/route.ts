import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { clearDiscoveryCache, discover, normalizeIssuer } from "@/lib/kosmy-board/oidc";

export const runtime = "nodejs";

/**
 * PUT /api/admin/kosmy-board — save the "Se connecter avec Kosmy Board" settings.
 * Body: { issuer, clientId, clientSecret?, autoCreate? }.
 * An empty / missing clientSecret keeps the stored one. The secret is never returned.
 */
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  let body: { issuer?: string; clientId?: string; clientSecret?: string; autoCreate?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const issuer = normalizeIssuer(body.issuer);
  if (!issuer) return NextResponse.json({ error: "invalid_issuer" }, { status: 400 });
  const clientId = (body.clientId ?? "").trim();
  if (!clientId || clientId.length > 200) return NextResponse.json({ error: "invalid_client_id" }, { status: 400 });

  const existing = await prisma.kosmyBoardSettings.findUnique({ where: { id: 1 } });
  const newSecret = (body.clientSecret ?? "").trim();
  if (newSecret.length > 500) return NextResponse.json({ error: "invalid_client_secret" }, { status: 400 });
  const clientSecret = newSecret || existing?.clientSecret || "";
  if (!clientSecret) return NextResponse.json({ error: "missing_client_secret" }, { status: 400 });

  const data = { issuer, clientId, clientSecret, autoCreate: body.autoCreate === true };
  await prisma.kosmyBoardSettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
  clearDiscoveryCache();

  // Tell the admin right away whether the issuer answers.
  let reachable = true;
  try {
    await discover(issuer);
  } catch {
    reachable = false;
  }

  return NextResponse.json({
    settings: { issuer, clientId, autoCreate: data.autoCreate, hasSecret: true },
    reachable,
  });
}

/** DELETE /api/admin/kosmy-board — turn Kosmy Board sign-in off (links on accounts are kept). */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  await prisma.kosmyBoardSettings.deleteMany({});
  clearDiscoveryCache();
  return NextResponse.json({ ok: true });
}
