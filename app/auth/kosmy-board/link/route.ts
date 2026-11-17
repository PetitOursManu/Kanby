import { NextRequest } from "next/server";
import { appBaseUrl } from "@/lib/kosmy-board/oidc";
import { getKosmySettings } from "@/lib/kosmy-board/server";
import { redirectWithError, startKosmyFlow } from "@/lib/kosmy-board/start";
import { getSessionUserFromRequest } from "@/lib/auth/session";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /auth/kosmy-board/link — "Relier à Kosmy Board" from the profile page.
 * The signed-in user runs the Kosmy Board flow; the `sub` received is then
 * stored on their account (see the callback).
 */
export async function POST(req: NextRequest) {
  const base = appBaseUrl(req.nextUrl.origin);

  // Same-origin form post only (the session cookie is SameSite=Lax, this is belt and braces).
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(base).origin && origin !== req.nextUrl.origin) {
    return NextResponse.json({ error: "Origine refusée" }, { status: 403 });
  }

  const user = await getSessionUserFromRequest(req);
  if (!user) return NextResponse.redirect(new URL("/login?next=/profile", base), 303);

  const settings = await getKosmySettings();
  if (!settings) return redirectWithError(base, "/profile", "not_configured");

  try {
    return await startKosmyFlow(settings, base, { target: "/profile", mode: "link", uid: user.id });
  } catch (e) {
    console.error("[kosmy-board] link start failed:", (e as Error).message);
    return redirectWithError(base, "/profile", "unreachable");
  }
}
