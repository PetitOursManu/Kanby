import { NextRequest } from "next/server";
import { appBaseUrl, normalizeIssuer, safeTarget } from "@/lib/kosmy-board/oidc";
import { getKosmySettings } from "@/lib/kosmy-board/server";
import { redirectWithError, startKosmyFlow } from "@/lib/kosmy-board/start";
import { rateLimitOr429 } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /auth/kosmy-board/login — start "Se connecter avec Kosmy Board".
 *
 * Called by the button on the login page, or directly by Kosmy Board ("Ouvrir":
 * third-party initiated login, OpenID Connect Core §4) with `iss` and
 * `target_link_uri`.
 */
export async function GET(req: NextRequest) {
  const limited = rateLimitOr429(req, "kosmy-login", 30, 60);
  if (limited) return limited;

  const base = appBaseUrl(req.nextUrl.origin);
  const settings = await getKosmySettings();
  if (!settings) return redirectWithError(base, "/login", "not_configured");

  // Third-party initiated login: refuse an issuer other than the configured one.
  const iss = req.nextUrl.searchParams.get("iss");
  if (iss !== null && normalizeIssuer(iss) !== settings.issuer) {
    return redirectWithError(base, "/login", "issuer");
  }

  // Only a page of this instance (same origin) — never an open redirect.
  const target = safeTarget(req.nextUrl.searchParams.get("target_link_uri"), base);

  try {
    return await startKosmyFlow(settings, base, { target, mode: "login" });
  } catch (e) {
    console.error("[kosmy-board] login start failed:", (e as Error).message);
    return redirectWithError(base, "/login", "unreachable");
  }
}
