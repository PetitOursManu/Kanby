import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  FLOW_COOKIE,
  OidcError,
  appBaseUrl,
  discover,
  exchangeCode,
  redirectUri,
  stateMatches,
  verifyFlow,
  verifyIdToken,
  type Flow,
} from "@/lib/kosmy-board/oidc";
import { linkKosmyAccount, resolveKosmyAccount } from "@/lib/kosmy-board/accounts";
import { flowCookieOptions, getKosmySettings, prismaAccountRepo } from "@/lib/kosmy-board/server";
import { signInWithBoardAccess } from "@/lib/kosmy-board/users";
import { prismaUsersStore } from "@/lib/kosmy-board/users-deps";
import { redirectWithError } from "@/lib/kosmy-board/start";
import { getSessionUserFromRequest, issueSession } from "@/lib/auth/session";
import { rateLimitOr429 } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /auth/kosmy-board/callback — return from Kosmy Board.
 * Checks state (single use) and iss, exchanges the code (client_secret_basic +
 * PKCE), fully verifies the ID token, then signs in or links the account.
 *
 * When the ID token carries `kosmy_board_access` (access managed by the Board,
 * kosmy.board-users.v1), its role and restrictions are applied like a PUT and
 * the account is created if needed; otherwise sign-in is unchanged.
 */
export async function GET(req: NextRequest) {
  const limited = rateLimitOr429(req, "kosmy-callback", 30, 60);
  if (limited) return limited;

  const base = appBaseUrl(req.nextUrl.origin);
  const params = req.nextUrl.searchParams;

  // The flow is single use: consume the cookie whatever happens next.
  const flow = verifyFlow(req.cookies.get(FLOW_COOKIE)?.value);
  cookies().set(FLOW_COOKIE, "", flowCookieOptions(0));

  if (!flow || !stateMatches(flow, params.get("state"))) {
    return redirectWithError(base, "/login", "expired");
  }
  const errorPage = flow.mode === "link" ? "/profile" : "/login";

  if (params.get("error")) {
    return redirectWithError(base, errorPage, params.get("error") === "access_denied" ? "denied" : "failed");
  }

  const settings = await getKosmySettings();
  if (!settings) return redirectWithError(base, errorPage, "not_configured");
  // Settings changed while the flow was running.
  if (flow.iss !== settings.issuer) return redirectWithError(base, errorPage, "issuer");

  try {
    const { doc, jwks } = await discover(settings.issuer);

    // RFC 9207: the response must come from the expected issuer (Kosmy Board always sends it).
    const iss = params.get("iss");
    if (iss !== null && iss !== doc.issuer) return redirectWithError(base, errorPage, "issuer");

    const code = params.get("code");
    if (!code) return redirectWithError(base, errorPage, "failed");

    const idToken = await exchangeCode(doc, {
      code,
      redirectUri: redirectUri(base),
      verifier: flow.verifier,
      clientId: settings.clientId,
      clientSecret: settings.clientSecret,
    });
    const claims = await verifyIdToken(idToken, {
      issuer: doc.issuer,
      clientId: settings.clientId,
      nonce: flow.nonce,
      jwks,
    });

    if (flow.mode === "link") return await finishLink(req, base, flow, claims.sub);

    const result = claims.access
      ? await signInWithBoardAccess({ ...claims, access: claims.access }, prismaUsersStore)
      : await resolveKosmyAccount(claims, { autoCreate: settings.autoCreate }, prismaAccountRepo);
    if (!result.ok) return redirectWithError(base, "/login", result.error);

    await issueSession(result.user);
    const dest = result.user.mustChangePwd ? "/profile?mustChange=1" : flow.target;
    return NextResponse.redirect(new URL(dest, base), 303);
  } catch (e) {
    const code = e instanceof OidcError ? e.code : "unreachable";
    console.error("[kosmy-board] callback failed:", (e as Error).message);
    return redirectWithError(base, errorPage, code);
  }
}

async function finishLink(req: NextRequest, base: string, flow: Flow, sub: string): Promise<NextResponse> {
  // The account to link is the one that started the flow, and it must still be signed in.
  const current = await getSessionUserFromRequest(req);
  if (!current || current.id !== flow.uid) return redirectWithError(base, "/profile", "session");

  const result = await linkKosmyAccount(current.id, sub, prismaAccountRepo);
  if (!result.ok) return redirectWithError(base, "/profile", result.error);

  const url = new URL("/profile", base);
  url.searchParams.set("kosmy", "linked");
  return NextResponse.redirect(url, 303);
}
