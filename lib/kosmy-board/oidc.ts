/**
 * "Se connecter avec Kosmy Board" — OpenID Connect client helpers.
 *
 * Kosmy Board is a standard OpenID Connect provider. This module holds the
 * protocol pieces (discovery, PKCE, authorization URL, code exchange, ID token
 * verification, the short-lived flow cookie). It has no Prisma and no
 * next/headers dependency so it can be unit-tested.
 *
 * Spec: Kosmy Board `docs/integration.md`.
 */
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { getJwtSecret } from "@/lib/auth/jwt";

export const LOGIN_PATH = "/auth/kosmy-board/login";
export const CALLBACK_PATH = "/auth/kosmy-board/callback";
export const LINK_PATH = "/auth/kosmy-board/link";
/** Cookie holding state / nonce / PKCE verifier between launch and callback. */
export const FLOW_COOKIE = "kanby_kosmy_flow";
export const FLOW_TTL_SECONDS = 10 * 60;
export const DEFAULT_TARGET = "/boards";

const FLOW_AUDIENCE = "kanby:kosmy-board-flow";

/* ---------- Small helpers ---------- */

/** Trim and drop trailing slashes. Returns null for anything that is not an http(s) URL. */
export function normalizeIssuer(value: string | null | undefined): string | null {
  const v = (value ?? "").trim().replace(/\/+$/, "");
  if (!v) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.search || u.hash || u.username || u.password) return null;
    return v;
  } catch {
    return null;
  }
}

/** Public base URL of this Kanby instance (APP_URL), without trailing slash. */
export function appBaseUrl(fallbackOrigin: string): string {
  const fromEnv = (process.env.APP_URL || "").trim().replace(/\/+$/, "");
  return fromEnv || fallbackOrigin.replace(/\/+$/, "");
}

export function redirectUri(base: string): string {
  return `${base}${CALLBACK_PATH}`;
}

export function initiateLoginUri(base: string): string {
  return `${base}${LOGIN_PATH}`;
}

/**
 * Where to land after sign-in. Only a page of this instance (same origin) is
 * accepted; anything else falls back to the default page. Prevents open redirects.
 */
export function safeTarget(target: string | null | undefined, base: string): string {
  if (!target) return DEFAULT_TARGET;
  try {
    const origin = new URL(base).origin;
    const u = new URL(target, base);
    if (u.origin !== origin) return DEFAULT_TARGET;
    const path = u.pathname + u.search;
    // "//evil.example" style paths are already resolved by URL above, but stay strict.
    if (!path.startsWith("/") || path.startsWith("//")) return DEFAULT_TARGET;
    return path;
  } catch {
    return DEFAULT_TARGET;
  }
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** PKCE S256: BASE64URL(SHA-256(verifier)). */
export function codeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/* ---------- Discovery (cached per issuer) ---------- */

export type Discovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  userinfo_endpoint?: string;
  end_session_endpoint?: string;
};

type Cached = { doc: Discovery; jwks: JWTVerifyGetKey; at: number };
const DISCOVERY_TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, Cached>();

export function clearDiscoveryCache(): void {
  cache.clear();
}

export async function discover(
  issuer: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ doc: Discovery; jwks: JWTVerifyGetKey }> {
  const hit = cache.get(issuer);
  if (hit && Date.now() - hit.at < DISCOVERY_TTL_MS) return hit;

  const res = await fetchImpl(`${issuer}/.well-known/openid-configuration`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`discovery failed (HTTP ${res.status})`);
  const doc = (await res.json()) as Discovery;
  if (doc.issuer !== issuer) throw new Error("discovery: issuer mismatch");
  for (const k of ["authorization_endpoint", "token_endpoint", "jwks_uri"] as const) {
    if (typeof doc[k] !== "string") throw new Error(`discovery: missing ${k}`);
  }
  const entry: Cached = { doc, jwks: createRemoteJWKSet(new URL(doc.jwks_uri)), at: Date.now() };
  cache.set(issuer, entry);
  return entry;
}

/* ---------- Authorization request ---------- */

export function buildAuthorizationUrl(
  doc: Pick<Discovery, "authorization_endpoint">,
  p: { clientId: string; redirectUri: string; state: string; nonce: string; verifier: string },
): string {
  const url = new URL(doc.authorization_endpoint);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    scope: "openid profile email",
    state: p.state,
    nonce: p.nonce,
    code_challenge: codeChallenge(p.verifier),
    code_challenge_method: "S256",
  }).toString();
  return url.href;
}

/* ---------- Flow cookie (signed, HttpOnly, short-lived) ---------- */

export type Flow = {
  state: string;
  nonce: string;
  verifier: string;
  /** Issuer the flow was started for. */
  iss: string;
  /** Same-origin path to land on after sign-in. */
  target: string;
  /** "login" = open a session; "link" = attach the Kosmy Board account to `uid`. */
  mode: "login" | "link";
  uid?: string;
};

/**
 * Sign the flow. The payload deliberately has no `sub` and carries a dedicated
 * audience, so it can never be mistaken for a session token.
 */
export function signFlow(flow: Flow): string {
  return jwt.sign({ ...flow }, getJwtSecret(), {
    algorithm: "HS256",
    audience: FLOW_AUDIENCE,
    expiresIn: FLOW_TTL_SECONDS,
  });
}

export function verifyFlow(token: string | null | undefined): Flow | null {
  if (!token) return null;
  try {
    const p = jwt.verify(token, getJwtSecret(), {
      algorithms: ["HS256"],
      audience: FLOW_AUDIENCE,
    }) as Flow & { sub?: unknown };
    if (p.sub !== undefined) return null;
    if (typeof p.state !== "string" || typeof p.nonce !== "string" || typeof p.verifier !== "string") return null;
    if (p.mode !== "login" && p.mode !== "link") return null;
    return {
      state: p.state,
      nonce: p.nonce,
      verifier: p.verifier,
      iss: p.iss,
      target: p.target,
      mode: p.mode,
      ...(p.uid ? { uid: p.uid } : {}),
    };
  } catch {
    return null;
  }
}

export function stateMatches(flow: Flow, state: string | null): boolean {
  return !!state && safeEqual(flow.state, state);
}

/* ---------- Token exchange ---------- */

export class OidcError extends Error {
  constructor(
    /** Short code used to pick the message shown to the user. */
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** HTTP Basic credentials per RFC 6749 §2.3.1 (form-urlencoded, then base64). */
export function basicAuthHeader(clientId: string, clientSecret: string): string {
  const enc = (s: string) => encodeURIComponent(s).replace(/%20/g, "+");
  return `Basic ${Buffer.from(`${enc(clientId)}:${enc(clientSecret)}`).toString("base64")}`;
}

/** Exchange the authorization code (client_secret_basic + PKCE verifier). Returns the raw ID token. */
export async function exchangeCode(
  doc: Pick<Discovery, "token_endpoint">,
  p: { code: string; redirectUri: string; verifier: string; clientId: string; clientSecret: string },
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const res = await fetchImpl(doc.token_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: basicAuthHeader(p.clientId, p.clientSecret),
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: p.code,
      redirect_uri: p.redirectUri,
      code_verifier: p.verifier,
    }).toString(),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string; error_description?: string };
  if (!res.ok || typeof body.id_token !== "string") {
    throw new OidcError("exchange", `token endpoint refused the code: ${body.error_description || body.error || res.status}`);
  }
  return body.id_token;
}

/* ---------- ID token ---------- */

export type KosmyClaims = {
  sub: string;
  name?: string;
  email?: string;
  preferred_username?: string;
  locale?: string;
  /**
   * `kosmy_board_access`: the role and restrictions given by a Board
   * administrator (protocol kosmy.board-users.v1), when the Board manages
   * this person's access. Checked by `signInWithBoardAccess`.
   */
  access?: { role: unknown; values?: unknown };
};

/** Full ID token check: RS256 signature (jwks_uri), iss, aud, exp, nonce. */
export async function verifyIdToken(
  idToken: string,
  p: { issuer: string; clientId: string; nonce: string; jwks: JWTVerifyGetKey },
): Promise<KosmyClaims> {
  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(idToken, p.jwks, {
      issuer: p.issuer,
      audience: p.clientId,
      algorithms: ["RS256"],
      requiredClaims: ["sub", "exp", "iat"],
    }));
  } catch (e) {
    throw new OidcError("token", `invalid ID token: ${(e as Error).message}`);
  }
  if (typeof payload.nonce !== "string" || !safeEqual(payload.nonce, p.nonce)) {
    throw new OidcError("token", "invalid ID token: nonce mismatch");
  }
  if (typeof payload.sub !== "string" || !payload.sub) {
    throw new OidcError("token", "invalid ID token: missing sub");
  }
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const access = payload.kosmy_board_access;
  return {
    sub: payload.sub,
    name: str(payload.name),
    email: str(payload.email),
    preferred_username: str(payload.preferred_username),
    locale: str(payload.locale),
    ...(access && typeof access === "object" && !Array.isArray(access)
      ? { access: { role: (access as Record<string, unknown>).role, values: (access as Record<string, unknown>).values } }
      : {}),
  };
}
