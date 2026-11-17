import { beforeAll, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK } from "jose";
import {
  DEFAULT_TARGET,
  basicAuthHeader,
  buildAuthorizationUrl,
  codeChallenge,
  discover,
  clearDiscoveryCache,
  exchangeCode,
  normalizeIssuer,
  safeTarget,
  signFlow,
  stateMatches,
  verifyFlow,
  verifyIdToken,
  type Flow,
} from "@/lib/kosmy-board/oidc";
import { linkKosmyAccount, resolveKosmyAccount, type KosmyAccountRepo } from "@/lib/kosmy-board/accounts";
import { verifySessionToken } from "@/lib/auth/jwt";

const ISSUER = "http://localhost:8767/oidc";
const CLIENT_ID = "kanby-client";
const BASE = "https://kanby.example.com";

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-for-kosmy-board-tests-0123456789";
});

describe("normalizeIssuer", () => {
  it("drops trailing slashes and spaces", () => {
    expect(normalizeIssuer("  https://board.example.com/oidc/ ")).toBe("https://board.example.com/oidc");
  });
  it("rejects non-http(s), query strings and garbage", () => {
    expect(normalizeIssuer("javascript:alert(1)")).toBeNull();
    expect(normalizeIssuer("ftp://board.example.com")).toBeNull();
    expect(normalizeIssuer("https://board.example.com/oidc?x=1")).toBeNull();
    expect(normalizeIssuer("not a url")).toBeNull();
    expect(normalizeIssuer("")).toBeNull();
  });
});

describe("safeTarget (target_link_uri)", () => {
  it("accepts an absolute URL of this instance and keeps path + query", () => {
    expect(safeTarget(`${BASE}/boards/abc?x=1`, BASE)).toBe("/boards/abc?x=1");
  });
  it("accepts a relative path", () => {
    expect(safeTarget("/profile", BASE)).toBe("/profile");
  });
  it("accepts the instance root (what the Board's Open button sends)", () => {
    expect(safeTarget(BASE, BASE)).toBe("/");
  });
  it("refuses another origin (open redirect)", () => {
    expect(safeTarget("https://evil.example.com/boards", BASE)).toBe(DEFAULT_TARGET);
    expect(safeTarget("//evil.example.com/boards", BASE)).toBe(DEFAULT_TARGET);
    expect(safeTarget("http://kanby.example.com/boards", BASE)).toBe(DEFAULT_TARGET); // other scheme
    expect(safeTarget("https://kanby.example.com:8443/", BASE)).toBe(DEFAULT_TARGET); // other port
    expect(safeTarget("javascript:alert(1)", BASE)).toBe(DEFAULT_TARGET);
  });
  it("falls back to the default page when missing", () => {
    expect(safeTarget(null, BASE)).toBe(DEFAULT_TARGET);
    expect(safeTarget("", BASE)).toBe(DEFAULT_TARGET);
  });
});

describe("authorization request", () => {
  it("uses PKCE S256 (RFC 7636 appendix B vector)", () => {
    expect(codeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("builds the authorization URL with code flow, state, nonce and PKCE", () => {
    const url = new URL(
      buildAuthorizationUrl(
        { authorization_endpoint: `${ISSUER}/auth` },
        { clientId: CLIENT_ID, redirectUri: `${BASE}/auth/kosmy-board/callback`, state: "st", nonce: "no", verifier: "ve" },
      ),
    );
    expect(url.origin + url.pathname).toBe(`${ISSUER}/auth`);
    const p = url.searchParams;
    expect(p.get("response_type")).toBe("code");
    expect(p.get("client_id")).toBe(CLIENT_ID);
    expect(p.get("redirect_uri")).toBe(`${BASE}/auth/kosmy-board/callback`);
    expect(p.get("scope")).toBe("openid profile email");
    expect(p.get("state")).toBe("st");
    expect(p.get("nonce")).toBe("no");
    expect(p.get("code_challenge")).toBe(codeChallenge("ve"));
    expect(p.get("code_challenge_method")).toBe("S256");
  });
});

describe("flow cookie", () => {
  const flow: Flow = { state: "s1", nonce: "n1", verifier: "v1", iss: ISSUER, target: "/boards", mode: "login" };

  it("round-trips", () => {
    expect(verifyFlow(signFlow(flow))).toEqual(flow);
  });
  it("keeps the user id for account linking", () => {
    expect(verifyFlow(signFlow({ ...flow, mode: "link", uid: "u1" }))?.uid).toBe("u1");
  });
  it("rejects tampering, other secrets and missing cookies", () => {
    const token = signFlow(flow);
    expect(verifyFlow(token.slice(0, -2) + "xx")).toBeNull();
    expect(verifyFlow(jwt.sign({ ...flow }, "another-secret", { audience: "kanby:kosmy-board-flow" }))).toBeNull();
    expect(verifyFlow(undefined)).toBeNull();
  });
  it("rejects a session token used as a flow, and cannot be used as a session", () => {
    const session = jwt.sign({ sub: "u1", role: "ADMIN" }, process.env.JWT_SECRET!);
    expect(verifyFlow(session)).toBeNull();
    expect(verifySessionToken(signFlow(flow))).toBeNull();
  });
  it("expires", () => {
    const old = jwt.sign({ ...flow, exp: Math.floor(Date.now() / 1000) - 1 }, process.env.JWT_SECRET!, {
      audience: "kanby:kosmy-board-flow",
    });
    expect(verifyFlow(old)).toBeNull();
  });
  it("checks state in constant time and refuses a missing one", () => {
    expect(stateMatches(flow, "s1")).toBe(true);
    expect(stateMatches(flow, "s2")).toBe(false);
    expect(stateMatches(flow, null)).toBe(false);
  });
});

describe("discovery", () => {
  it("refuses a document announcing another issuer", async () => {
    clearDiscoveryCache();
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ issuer: "https://evil.example.com", authorization_endpoint: "a", token_endpoint: "t", jwks_uri: "https://evil.example.com/jwks" })),
    ) as unknown as typeof fetch;
    await expect(discover(ISSUER, fetchImpl)).rejects.toThrow(/issuer mismatch/);
  });
  it("reads {issuer}/.well-known/openid-configuration and caches it", async () => {
    clearDiscoveryCache();
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ issuer: ISSUER, authorization_endpoint: `${ISSUER}/auth`, token_endpoint: `${ISSUER}/token`, jwks_uri: `${ISSUER}/jwks` })),
    );
    const { doc } = await discover(ISSUER, fetchImpl as unknown as typeof fetch);
    await discover(ISSUER, fetchImpl as unknown as typeof fetch);
    expect(doc.token_endpoint).toBe(`${ISSUER}/token`);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect((fetchImpl.mock.calls[0] as unknown[])[0]).toBe(`${ISSUER}/.well-known/openid-configuration`);
  });
});

describe("code exchange", () => {
  it("uses client_secret_basic and sends the PKCE verifier", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ id_token: "the.id.token", access_token: "x" }), { status: 200 });
    }) as unknown as typeof fetch;

    const idToken = await exchangeCode(
      { token_endpoint: `${ISSUER}/token` },
      { code: "c0de", redirectUri: `${BASE}/auth/kosmy-board/callback`, verifier: "v3rifier", clientId: CLIENT_ID, clientSecret: "s3cr:et" },
      fetchImpl,
    );
    expect(idToken).toBe("the.id.token");
    expect(seen!.url).toBe(`${ISSUER}/token`);
    const headers = seen!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from(`${CLIENT_ID}:s3cr%3Aet`).toString("base64")}`);
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    const body = new URLSearchParams(String(seen!.init.body));
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("c0de");
    expect(body.get("code_verifier")).toBe("v3rifier");
    expect(body.get("redirect_uri")).toBe(`${BASE}/auth/kosmy-board/callback`);
    expect(body.get("client_secret")).toBeNull(); // never in the body with client_secret_basic
  });

  it("form-urlencodes credentials before base64 (RFC 6749 §2.3.1)", () => {
    expect(basicAuthHeader("a b", "c+d")).toBe(`Basic ${Buffer.from("a+b:c%2Bd").toString("base64")}`);
  });

  it("fails cleanly when the Board refuses the code", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })) as unknown as typeof fetch;
    await expect(
      exchangeCode({ token_endpoint: "x" }, { code: "c", redirectUri: "r", verifier: "v", clientId: "i", clientSecret: "s" }, fetchImpl),
    ).rejects.toMatchObject({ code: "exchange" });
  });
});

describe("ID token verification", () => {
  let privateKey: CryptoKey;
  let otherKey: CryptoKey;
  let jwks: ReturnType<typeof createLocalJWKSet>;

  beforeAll(async () => {
    const pair = await generateKeyPair("RS256");
    privateKey = pair.privateKey as CryptoKey;
    otherKey = (await generateKeyPair("RS256")).privateKey as CryptoKey;
    const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
    jwks = createLocalJWKSet({ keys: [jwk] });
  });

  function token(claims: Record<string, unknown>, opts: { key?: CryptoKey; exp?: number } = {}) {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ nonce: "n0nce", name: "Ada", email: "ada@example.com", ...claims })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer((claims.iss as string) ?? ISSUER)
      .setAudience((claims.aud as string) ?? CLIENT_ID)
      .setSubject((claims.sub as string) ?? "board-user-1")
      .setIssuedAt(now)
      .setExpirationTime(opts.exp ?? now + 300)
      .sign(opts.key ?? privateKey);
  }
  const check = (t: string, nonce = "n0nce") => verifyIdToken(t, { issuer: ISSUER, clientId: CLIENT_ID, nonce, jwks });

  it("accepts a valid token and returns the claims", async () => {
    const claims = await check(await token({ locale: "fr" }));
    expect(claims).toEqual({ sub: "board-user-1", name: "Ada", email: "ada@example.com", preferred_username: undefined, locale: "fr" });
  });
  it("rejects a bad signature", async () => {
    await expect(check(await token({}, { key: otherKey }))).rejects.toMatchObject({ code: "token" });
  });
  it("rejects another issuer", async () => {
    await expect(check(await token({ iss: "https://evil.example.com/oidc" }))).rejects.toMatchObject({ code: "token" });
  });
  it("rejects another audience", async () => {
    await expect(check(await token({ aud: "other-client" }))).rejects.toMatchObject({ code: "token" });
  });
  it("rejects an expired token", async () => {
    await expect(check(await token({}, { exp: Math.floor(Date.now() / 1000) - 120 }))).rejects.toMatchObject({ code: "token" });
  });
  it("rejects a wrong or missing nonce", async () => {
    await expect(check(await token({}), "other-nonce")).rejects.toThrow(/nonce/);
    await expect(check(await token({ nonce: undefined }))).rejects.toThrow(/nonce/);
  });
  it("rejects an unsigned token (alg none) and HS256", async () => {
    const none = `${Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")}.${Buffer.from(
      JSON.stringify({ iss: ISSUER, aud: CLIENT_ID, sub: "x", nonce: "n0nce", exp: 9999999999, iat: 1 }),
    ).toString("base64url")}.`;
    await expect(check(none)).rejects.toMatchObject({ code: "token" });
    const hs = jwt.sign({ iss: ISSUER, aud: CLIENT_ID, sub: "x", nonce: "n0nce" }, "secret", { expiresIn: 60 });
    await expect(check(hs)).rejects.toMatchObject({ code: "token" });
  });
});

/* ---------- Accounts: by sub only, never by email ---------- */

type U = { id: string; active: boolean; email: string; kosmySub: string | null; globalRole: "USER" | "ADMIN" };

function memoryRepo(users: U[]): KosmyAccountRepo<U> & { users: U[] } {
  return {
    users,
    findBySub: async (sub) => users.find((u) => u.kosmySub === sub) ?? null,
    findById: async (id) => users.find((u) => u.id === id) ?? null,
    emailTaken: async (email) => users.some((u) => u.email === email),
    createUser: async (d) => {
      const u: U = { id: crypto.randomUUID(), active: true, email: d.email, kosmySub: d.kosmySub, globalRole: d.globalRole };
      users.push(u);
      return u;
    },
    setSub: async (id, sub) => {
      users.find((u) => u.id === id)!.kosmySub = sub;
    },
  };
}

describe("resolveKosmyAccount", () => {
  const admin: U = { id: "admin", active: true, email: "admin@kanby.local", kosmySub: null, globalRole: "ADMIN" };

  it("signs in the account linked to this sub", async () => {
    const repo = memoryRepo([{ ...admin, kosmySub: "sub-1" }]);
    const r = await resolveKosmyAccount({ sub: "sub-1" }, { autoCreate: false }, repo);
    expect(r).toMatchObject({ ok: true, created: false, user: { id: "admin" } });
  });

  it("never matches an existing account by email", async () => {
    const repo = memoryRepo([{ ...admin }]);
    const r = await resolveKosmyAccount({ sub: "attacker", email: "admin@kanby.local" }, { autoCreate: false }, repo);
    expect(r).toEqual({ ok: false, error: "not_linked" });
  });

  it("does not create accounts when auto-creation is off (default)", async () => {
    const repo = memoryRepo([]);
    expect(await resolveKosmyAccount({ sub: "new", email: "new@example.com" }, { autoCreate: false }, repo)).toEqual({
      ok: false,
      error: "not_linked",
    });
    expect(repo.users).toHaveLength(0);
  });

  it("auto-creation makes a regular user, never an administrator", async () => {
    const repo = memoryRepo([]);
    const r = await resolveKosmyAccount({ sub: "new", email: "New@Example.com", name: "Nouvelle" }, { autoCreate: true }, repo);
    expect(r).toMatchObject({ ok: true, created: true });
    expect(repo.users[0]).toMatchObject({ email: "new@example.com", kosmySub: "new", globalRole: "USER" });
  });

  it("auto-creation refuses to take over an email already used", async () => {
    const repo = memoryRepo([{ ...admin }]);
    const r = await resolveKosmyAccount({ sub: "attacker", email: "admin@kanby.local" }, { autoCreate: true }, repo);
    expect(r).toEqual({ ok: false, error: "email_taken" });
    expect(repo.users).toHaveLength(1);
    expect(repo.users[0].kosmySub).toBeNull();
  });

  it("refuses a deactivated account", async () => {
    const repo = memoryRepo([{ ...admin, kosmySub: "sub-1", active: false }]);
    expect(await resolveKosmyAccount({ sub: "sub-1" }, { autoCreate: true }, repo)).toEqual({ ok: false, error: "inactive" });
  });
});

describe("linkKosmyAccount", () => {
  it("stores the sub on the signed-in account", async () => {
    const repo = memoryRepo([{ id: "u1", active: true, email: "a@x", kosmySub: null, globalRole: "USER" }]);
    expect(await linkKosmyAccount("u1", "sub-1", repo)).toEqual({ ok: true });
    expect(repo.users[0].kosmySub).toBe("sub-1");
  });
  it("refuses a sub already linked to someone else", async () => {
    const repo = memoryRepo([
      { id: "u1", active: true, email: "a@x", kosmySub: null, globalRole: "USER" },
      { id: "u2", active: true, email: "b@x", kosmySub: "sub-1", globalRole: "USER" },
    ]);
    expect(await linkKosmyAccount("u1", "sub-1", repo)).toEqual({ ok: false, error: "already_linked" });
    expect(repo.users[0].kosmySub).toBeNull();
  });
  it("refuses when the account is gone or deactivated", async () => {
    const repo = memoryRepo([{ id: "u1", active: false, email: "a@x", kosmySub: null, globalRole: "USER" }]);
    expect(await linkKosmyAccount("u1", "sub-1", repo)).toEqual({ ok: false, error: "session" });
    expect(await linkKosmyAccount("nope", "sub-1", repo)).toEqual({ ok: false, error: "session" });
  });
});
