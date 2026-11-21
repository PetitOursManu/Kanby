import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { disableKosmySettings, saveKosmySettings, type SaveKosmyInput } from "@/lib/kosmy-board/server";

export const runtime = "nodejs";

/**
 * PUT /api/admin/kosmy-board — save the "Se connecter avec Kosmy Board" settings.
 * Body: { issuer, clientId, clientSecret?, autoCreate? }.
 * An empty / missing clientSecret keeps the stored one. The secret is never returned.
 */
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  let body: SaveKosmyInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Requête invalide" }, { status: 400 });

  const result = await saveKosmySettings(body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  // Tell the admin right away whether the issuer answers.
  return NextResponse.json({ settings: result.settings, reachable: result.reachable });
}

/** DELETE /api/admin/kosmy-board — turn Kosmy Board sign-in off (links on accounts are kept). */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  await disableKosmySettings();
  return NextResponse.json({ ok: true });
}
