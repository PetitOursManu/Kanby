/**
 * Shared start of the Kosmy Board flow (sign-in and account linking):
 * discovery, state / nonce / PKCE, flow cookie, redirect to the Board.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  FLOW_COOKIE,
  buildAuthorizationUrl,
  discover,
  randomToken,
  redirectUri,
  signFlow,
  type Flow,
} from "@/lib/kosmy-board/oidc";
import { flowCookieOptions, type KosmySettings } from "@/lib/kosmy-board/server";

export async function startKosmyFlow(
  settings: KosmySettings,
  base: string,
  p: { target: string; mode: Flow["mode"]; uid?: string },
): Promise<NextResponse> {
  const { doc } = await discover(settings.issuer);
  const flow: Flow = {
    state: randomToken(16),
    nonce: randomToken(16),
    verifier: randomToken(32),
    iss: settings.issuer,
    target: p.target,
    mode: p.mode,
    ...(p.uid ? { uid: p.uid } : {}),
  };
  cookies().set(FLOW_COOKIE, signFlow(flow), flowCookieOptions());
  const url = buildAuthorizationUrl(doc, {
    clientId: settings.clientId,
    redirectUri: redirectUri(base),
    state: flow.state,
    nonce: flow.nonce,
    verifier: flow.verifier,
  });
  return NextResponse.redirect(url, 303);
}

/** Redirect to a page of this instance with an error code shown to the user. */
export function redirectWithError(base: string, page: "/login" | "/profile", code: string): NextResponse {
  const url = new URL(page, base);
  url.searchParams.set("kosmy_error", code);
  return NextResponse.redirect(url, 303);
}
