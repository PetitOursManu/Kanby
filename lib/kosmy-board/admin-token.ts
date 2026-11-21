/**
 * "Admin dans le Board" (protocol kosmy.board-admin.v1) — the Board's token.
 *
 * The Board's server calls `/api/kosmy-board/admin/**` with a short-lived JWT
 * signed with the same key as its ID tokens (RS256, `jwks_uri`). Checks, in
 * the order of the spec: signature, `typ`, iss / aud / exp, htm / htu, single
 * use `jti`. Who the person is in Kanby (sub → linked account → admin rights)
 * is checked afterwards by the caller.
 *
 * No Prisma, no next/* import: unit-testable.
 * Spec: Kosmy Board `docs/admin-api.md`.
 */
import { errors, jwtVerify, type JWTVerifyGetKey } from "jose";

export const ADMIN_TOKEN_TYPE = "kb-admin+jwt";
/** Clock skew accepted on exp / iat, in seconds. */
export const CLOCK_TOLERANCE_SECONDS = 30;

export type AdminTokenFailure = "signature" | "typ" | "claims" | "expired" | "htm" | "htu" | "jti" | "replay" | "sub";

export class AdminTokenError extends Error {
  constructor(public reason: AdminTokenFailure, detail?: string) {
    super(detail ? `${reason}: ${detail}` : reason);
  }
}

/**
 * The `jti` values already used, kept until the token would expire anyway
 * (plus the clock tolerance). In memory: a restart forgets them, but tokens
 * only live 60 seconds.
 */
export class JtiCache {
  private seen = new Map<string, number>();

  /** Record `jti`. Returns false if it was already used (replay). */
  use(jti: string, expiresAtMs: number, nowMs = Date.now()): boolean {
    for (const [k, exp] of this.seen) if (exp < nowMs) this.seen.delete(k);
    if (this.seen.has(jti)) return false;
    this.seen.set(jti, expiresAtMs);
    return true;
  }

  get size(): number {
    return this.seen.size;
  }
}

export type BoardAdminClaims = {
  sub: string;
  jti: string;
  /** Full URL the Board called (signed by the Board). */
  htu: string;
  /** Display only: never used to find an account. */
  name?: string;
  email?: string;
};

export async function verifyBoardAdminToken(
  token: string,
  p: {
    issuer: string;
    clientId: string;
    jwks: JWTVerifyGetKey;
    /** HTTP method of the request being served. */
    method: string;
    /** Path of the request being served, e.g. /api/kosmy-board/admin/users. */
    path: string;
    jti: JtiCache;
    now?: Date;
  },
): Promise<BoardAdminClaims> {
  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(token, p.jwks, {
      issuer: p.issuer,
      audience: p.clientId,
      typ: ADMIN_TOKEN_TYPE,
      algorithms: ["RS256"],
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
      maxTokenAge: "2 minutes",
      requiredClaims: ["sub", "exp", "iat", "jti"],
      ...(p.now ? { currentDate: p.now } : {}),
    }));
  } catch (e) {
    if (e instanceof errors.JWTExpired) throw new AdminTokenError("expired");
    if (e instanceof errors.JWTClaimValidationFailed) {
      throw e.claim === "typ" ? new AdminTokenError("typ") : new AdminTokenError("claims", e.claim);
    }
    throw new AdminTokenError("signature", (e as Error).message);
  }

  // The token was made for this very request: same method, same path.
  if (payload.htm !== p.method) throw new AdminTokenError("htm");
  let htuPath = "";
  try {
    if (typeof payload.htu === "string") htuPath = new URL(payload.htu).pathname;
  } catch {
    /* refused just below */
  }
  if (!htuPath || !htuPath.endsWith(p.path)) throw new AdminTokenError("htu");

  if (typeof payload.sub !== "string" || !payload.sub) throw new AdminTokenError("sub");
  if (typeof payload.jti !== "string" || !payload.jti || payload.jti.length > 200) throw new AdminTokenError("jti");

  // Single use. Recorded only once everything else is valid.
  const nowMs = (p.now ?? new Date()).getTime();
  const exp = typeof payload.exp === "number" ? payload.exp : 0;
  if (!p.jti.use(payload.jti, exp * 1000 + CLOCK_TOLERANCE_SECONDS * 1000, nowMs)) {
    throw new AdminTokenError("replay");
  }

  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  return { sub: payload.sub, jti: payload.jti, htu: payload.htu as string, name: str(payload.name), email: str(payload.email) };
}
