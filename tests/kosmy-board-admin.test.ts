/**
 * Admin in Kosmy Board (protocol kosmy.board-admin.v1), without a database:
 * the Board is faked with a test RSA key and a local JWKS, and Prisma with a
 * small in-memory store. Everything else is the real code: token checks,
 * sections, and Kanby's admin functions (lib/admin/service.ts).
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK } from "jose";

type Row = Record<string, any>;

const { db, fakePrisma } = vi.hoisted(() => {
  const db = { users: [] as Row[], boards: [] as Row[], settings: null as Row | null, seq: 0 };
  const matches = (x: Row, where: Row) => Object.entries(where).every(([k, v]) => x[k] === v);
  const view = (u: Row, select?: Row) => {
    if (!select) return { ...u };
    const out: Row = {};
    for (const k of Object.keys(select)) {
      out[k] = k === "_count" ? { ownedBoards: db.boards.filter((b) => b.ownerId === u.id).length, apiTokens: 0 } : u[k];
    }
    return out;
  };
  const fakePrisma = {
    user: {
      count: async () => db.users.length,
      findMany: async ({ select }: Row = {}) =>
        [...db.users].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map((u) => view(u, select)),
      findUnique: async ({ where, select }: Row) => {
        const u = db.users.find((x) => matches(x, where));
        return u ? view(u, select) : null;
      },
      create: async ({ data, select }: Row) => {
        const u = { id: `u${++db.seq}`, createdAt: new Date(), active: true, mustChangePwd: false, kosmySub: null, avatarUrl: null, ...data };
        db.users.push(u);
        return view(u, select);
      },
      update: async ({ where, data, select }: Row) => {
        const u = db.users.find((x) => x.id === where.id)!;
        Object.assign(u, data);
        return view(u, select);
      },
      delete: async ({ where }: Row) => {
        db.users = db.users.filter((x) => x.id !== where.id);
        db.boards = db.boards.filter((b) => b.ownerId !== where.id);
      },
    },
    board: {
      count: async () => db.boards.length,
      findMany: async () =>
        db.boards.map((b) => {
          const o = db.users.find((u) => u.id === b.ownerId)!;
          return { ...b, owner: { id: o.id, displayName: o.displayName, email: o.email }, _count: { cards: 2, members: 1 } };
        }),
    },
    card: { count: async ({ where }: Row) => (where.completedAt === null ? 3 : 1) },
    kosmyBoardSettings: {
      findUnique: async () => db.settings,
      upsert: async ({ create, update }: Row) => {
        db.settings = db.settings ? { ...db.settings, ...update } : { ...create };
      },
      deleteMany: async () => {
        db.settings = null;
      },
    },
  };
  return { db, fakePrisma };
});

vi.mock("@/lib/prisma", () => ({ prisma: fakePrisma }));

import { handleBoardAdmin, localeFromAcceptLanguage, type BoardAdminDeps } from "@/lib/kosmy-board/admin";
import { boardAdminDeps } from "@/lib/kosmy-board/admin-deps";
import { JtiCache } from "@/lib/kosmy-board/admin-token";
import { verifyPassword } from "@/lib/auth/passwords";

const ISSUER = "https://board.example.com/oidc";
const CLIENT_ID = "kanby-client";
const APP = "https://kanby.example.com";
const ADMIN_PATH = "/api/kosmy-board/admin";

let boardKey: CryptoKey;
let otherKey: CryptoKey;
let jwks: ReturnType<typeof createLocalJWKSet>;
let deps: BoardAdminDeps;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  boardKey = pair.privateKey as CryptoKey;
  otherKey = (await generateKeyPair("RS256")).privateKey as CryptoKey;
  const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  jwks = createLocalJWKSet({ keys: [jwk] });
});

beforeEach(() => {
  delete process.env.APP_URL;
  db.users = [
    { id: "admin", email: "admin@kanby.local", displayName: "Ada", globalRole: "ADMIN", active: true, kosmySub: "sub-admin", createdAt: new Date("2026-01-01") },
    { id: "bob", email: "bob@example.com", displayName: "Bob", globalRole: "USER", active: true, kosmySub: "sub-bob", createdAt: new Date("2026-02-01") },
    { id: "old", email: "old@example.com", displayName: "Old admin", globalRole: "ADMIN", active: false, kosmySub: "sub-old", createdAt: new Date("2026-03-01") },
    { id: "carl", email: "carl@example.com", displayName: "Carl", globalRole: "USER", active: true, kosmySub: null, createdAt: new Date("2026-04-01") },
  ].map((u) => ({ passwordHash: "x", mustChangePwd: false, avatarUrl: null, ...u }));
  db.boards = [{ id: "b1", name: "Roadmap", type: "TEAM", ownerId: "bob", updatedAt: new Date("2026-05-01") }];
  db.settings = { id: 1, issuer: ISSUER, clientId: CLIENT_ID, clientSecret: "the-client-secret", autoCreate: false };
  // Real wiring, except the network: discovery answers with the fake Board's keys.
  deps = {
    ...boardAdminDeps,
    discover: async () => ({ doc: { issuer: ISSUER }, jwks }),
    jti: new JtiCache(),
    generatePassword: () => "Temp-Password-123",
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

type TokenOpts = {
  method?: string;
  path?: string;
  typ?: string | null;
  aud?: string;
  iss?: string;
  sub?: string;
  jti?: string;
  iat?: number;
  exp?: number;
  key?: CryptoKey;
  extra?: Record<string, unknown>;
};

/** A token as the Board makes it (docs/admin-api.md), with overridable parts. */
function boardToken(o: TokenOpts = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header: Record<string, string> = { alg: "RS256", kid: "k1" };
  if (o.typ !== null) header.typ = o.typ ?? "kb-admin+jwt";
  return new SignJWT({ htm: o.method ?? "GET", htu: `${APP}${o.path ?? ADMIN_PATH}`, name: "Ada L.", email: "ada@board.example", ...o.extra })
    .setProtectedHeader(header as { alg: string })
    .setIssuer(o.iss ?? ISSUER)
    .setAudience(o.aud ?? CLIENT_ID)
    .setSubject(o.sub ?? "sub-admin")
    .setIssuedAt(o.iat ?? now)
    .setExpirationTime(o.exp ?? now + 60)
    .setJti(o.jti ?? crypto.randomUUID())
    .sign(o.key ?? boardKey);
}

async function call(
  path: string,
  o: { method?: string; token?: string | null; body?: unknown; lang?: string; section?: string | null } = {},
) {
  const method = o.method ?? "GET";
  const token = o.token === undefined ? await boardToken({ method, path }) : o.token;
  const headers: Record<string, string> = { "accept-language": o.lang ?? "fr" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (o.body !== undefined) headers["content-type"] = "application/json";
  const req = new Request(`${APP}${path}`, {
    method,
    headers,
    body: o.body === undefined ? undefined : typeof o.body === "string" ? o.body : JSON.stringify(o.body),
  });
  const section = o.section !== undefined ? o.section : path === ADMIN_PATH ? null : path.slice(ADMIN_PATH.length + 1);
  const res = await handleBoardAdmin(req, section, deps);
  return { status: res.status, json: (await res.json()) as any, headers: res.headers };
}

describe("summary", () => {
  it("answers a valid Board token with the protocol summary", async () => {
    const r = await call(ADMIN_PATH);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("access-control-allow-origin")).toBeNull();
    expect(r.json.protocol).toBe("kosmy.board-admin.v1");
    expect(r.json.app).toMatchObject({ name: "Kanby" });
    expect(typeof r.json.app.version).toBe("string");
    expect(r.json.user).toEqual({ name: "Ada", role: "Administrateur" });
    expect(r.json.sections.map((s: any) => s.id)).toEqual(["overview", "users", "boards", "kosmy-board"]);
    expect(r.json.sections[0].title).toBe("Vue d'ensemble");
  });

  it("speaks English when the Board asks for it", async () => {
    const r = await call(ADMIN_PATH, { lang: "en" });
    expect(r.json.sections[0].title).toBe("Overview");
    expect(r.json.user.role).toBe("Administrator");
    expect(localeFromAcceptLanguage("en-US,en;q=0.9")).toBe("en");
    expect(localeFromAcceptLanguage("de, en;q=0.5")).toBe("en");
    expect(localeFromAcceptLanguage(null)).toBe("fr");
  });

  it("only answers GET", async () => {
    const r = await call(ADMIN_PATH, { method: "POST", body: { action: "x" } });
    expect(r.status).toBe(405);
  });
});

describe("the Board's token", () => {
  const refused = async (token: string | null, path = ADMIN_PATH, method = "GET") => {
    const r = await call(path, { token, method, body: method === "POST" ? { action: "make-admin", row: "bob" } : undefined });
    expect(r.status).toBe(401);
    expect(r.json.error).toBe("invalid_token");
    expect(typeof r.json.message).toBe("string");
  };

  it("is required", async () => {
    await refused(null);
    await refused("not-a-jwt");
  });

  it("must be typed kb-admin+jwt: an ID token is never accepted", async () => {
    // Same key, issuer, audience and sub as a real ID token from the Board.
    await refused(await boardToken({ typ: "JWT", extra: { nonce: "n0nce" } }));
    await refused(await boardToken({ typ: null }));
  });

  it("must be signed by the Board's key, in RS256", async () => {
    await refused(await boardToken({ key: otherKey }));
    const hs = jwt.sign({ htm: "GET", htu: `${APP}${ADMIN_PATH}`, jti: "j" }, "secret", {
      header: { alg: "HS256", typ: "kb-admin+jwt" } as jwt.JwtHeader,
      issuer: ISSUER,
      audience: CLIENT_ID,
      subject: "sub-admin",
      expiresIn: 60,
    });
    await refused(hs);
  });

  it("must be for this instance (aud) and from the configured Board (iss)", async () => {
    await refused(await boardToken({ aud: "another-app" }));
    await refused(await boardToken({ iss: "https://evil.example.com/oidc" }));
  });

  it("expires (30 s of clock tolerance)", async () => {
    const now = Math.floor(Date.now() / 1000);
    await refused(await boardToken({ iat: now - 100, exp: now - 40 }));
    const r = await call(ADMIN_PATH, { token: await boardToken({ iat: now - 70, exp: now - 10 }) });
    expect(r.status).toBe(200);
  });

  it("is single use (jti)", async () => {
    const token = await boardToken();
    expect((await call(ADMIN_PATH, { token })).status).toBe(200);
    await refused(token);
  });

  it("only serves the request it was made for (htm / htu)", async () => {
    // Made for GET, used for POST.
    await refused(await boardToken({ method: "GET", path: `${ADMIN_PATH}/users` }), `${ADMIN_PATH}/users`, "POST");
    // Made for another section.
    await refused(await boardToken({ path: `${ADMIN_PATH}/boards` }), `${ADMIN_PATH}/users`);
    // Made for the summary, used on a section.
    await refused(await boardToken({ path: ADMIN_PATH }), `${ADMIN_PATH}/users`);
    // No user was changed by the refused POST.
    expect(db.users.find((u) => u.id === "bob")!.globalRole).toBe("USER");
  });

  it("is refused when Kosmy Board sign-in is not configured", async () => {
    db.settings = null;
    const r = await call(ADMIN_PATH);
    expect(r.status).toBe(401);
    expect(r.json).toMatchObject({ error: "invalid_token", message: expect.stringContaining("pas réglée") });
  });
});

describe("who may administer", () => {
  it("not_linked: the sub is linked to no Kanby account (never matched by email)", async () => {
    const token = await boardToken({ sub: "sub-unknown", extra: { email: "admin@kanby.local" } });
    const r = await call(ADMIN_PATH, { token });
    expect(r.status).toBe(403);
    expect(r.json.error).toBe("not_linked");
    expect(r.json.message).toMatch(/relié/);
  });

  it("forbidden: a linked account without admin rights", async () => {
    const r = await call(ADMIN_PATH, { token: await boardToken({ sub: "sub-bob" }), lang: "en" });
    expect(r.status).toBe(403);
    expect(r.json).toEqual({ error: "forbidden", message: "Your Kanby account does not have administrator rights." });
  });

  it("forbidden: a deactivated administrator", async () => {
    const r = await call(ADMIN_PATH, { token: await boardToken({ sub: "sub-old" }) });
    expect(r.status).toBe(403);
    expect(r.json.error).toBe("forbidden");
  });
});

describe("sections", () => {
  it("overview: stats and instance information", async () => {
    const r = await call(`${ADMIN_PATH}/overview`);
    expect(r.status).toBe(200);
    expect(r.json.id).toBe("overview");
    const stats = r.json.blocks.find((b: any) => b.type === "stats");
    expect(stats.items.map((i: any) => i.value)).toEqual([4, 1, 3, 1]);
    const fields = r.json.blocks.find((b: any) => b.type === "fields");
    expect(fields.items).toContainEqual({ label: "Émetteur Kosmy Board", value: ISSUER });
  });

  it("users: a table of accounts with the actions each one allows", async () => {
    const r = await call(`${ADMIN_PATH}/users`);
    expect(r.status).toBe(200);
    const table = r.json.blocks.find((b: any) => b.type === "table");
    expect(table.rows).toHaveLength(4);
    const me = table.rows.find((x: any) => x.id === "admin");
    expect(me.cells.name).toBe("Ada (vous)");
    expect(me.actions).toEqual(["reset-password"]); // never demote, disable or delete yourself
    const bob = table.rows.find((x: any) => x.id === "bob");
    expect(bob.actions).toEqual(["make-admin", "reset-password", "deactivate", "delete"]);
    expect(bob.cells.role).toEqual({ text: "Utilisateur", tone: "muted" });
    expect(table.rowActions.find((a: any) => a.id === "delete")).toMatchObject({ danger: true, confirm: expect.any(String) });
    expect(table.actions[0].id).toBe("create-user");
    expect(JSON.stringify(r.json)).not.toMatch(/passwordHash|"x"/);
  });

  it("boards: links stay on the instance", async () => {
    process.env.APP_URL = APP;
    const r = await call(`${ADMIN_PATH}/boards`);
    const table = r.json.blocks.find((b: any) => b.type === "table");
    expect(table.rows[0].cells.name).toEqual({ text: "Roadmap", href: `${APP}/boards/b1` });
    expect(table.rows[0].actions).toBeUndefined();
  });

  it("kosmy-board: the client secret is never sent", async () => {
    const r = await call(`${ADMIN_PATH}/kosmy-board`);
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.json)).not.toContain("the-client-secret");
    const form = r.json.blocks.find((b: any) => b.type === "form");
    const secret = form.fields.find((f: any) => f.name === "clientSecret");
    expect(secret.type).toBe("password");
    expect(secret).not.toHaveProperty("value");
  });

  it("unknown or malformed sections give 404", async () => {
    expect((await call(`${ADMIN_PATH}/nope`)).json.error).toBe("not_found");
    expect((await call(`${ADMIN_PATH}/Users`)).status).toBe(404);
  });
});

describe("actions", () => {
  const post = (section: string, body: unknown, lang = "fr") => call(`${ADMIN_PATH}/${section}`, { method: "POST", body, lang });

  it("make-admin changes the role and returns the updated section", async () => {
    const r = await post("users", { action: "make-admin", row: "bob" });
    expect(r.status).toBe(200);
    expect(r.json.ok).toBe(true);
    expect(r.json.message).toMatch(/Bob/);
    expect(db.users.find((u) => u.id === "bob")!.globalRole).toBe("ADMIN");
    const bob = r.json.section.blocks.find((b: any) => b.type === "table").rows.find((x: any) => x.id === "bob");
    expect(bob.actions[0]).toBe("remove-admin");
  });

  it("applies Kanby's own rules: no self-deletion, unknown rows give 404", async () => {
    const self = await post("users", { action: "delete", row: "admin" }, "en");
    expect(self.status).toBe(400);
    expect(self.json.message).toBe("You cannot delete your own account");
    expect(db.users.some((u) => u.id === "admin")).toBe(true);
    const gone = await post("users", { action: "deactivate", row: "nobody" });
    expect(gone.status).toBe(404);
    expect(gone.json.error).toBe("not_found");
    expect((await post("users", { action: "fly", row: "bob" })).status).toBe(404);
    expect((await post("users", { action: "delete" })).status).toBe(400);
  });

  it("delete removes the account and its boards", async () => {
    const r = await post("users", { action: "delete", row: "bob" });
    expect(r.status).toBe(200);
    expect(db.users.some((u) => u.id === "bob")).toBe(false);
    expect(db.boards).toHaveLength(0);
  });

  it("create-user reveals the temporary password once, and the account must change it", async () => {
    const r = await post("users", { action: "create-user", values: { displayName: "Dora", email: "Dora@Example.com", admin: false } });
    expect(r.status).toBe(200);
    expect(r.json.reveal).toEqual({ label: "Mot de passe temporaire de dora@example.com", value: "Temp-Password-123" });
    const dora = db.users.find((u) => u.email === "dora@example.com")!;
    expect(dora).toMatchObject({ globalRole: "USER", mustChangePwd: true });
    expect(await verifyPassword("Temp-Password-123", dora.passwordHash)).toBe(true);
    const dup = await post("users", { action: "create-user", values: { displayName: "Dora", email: "dora@example.com" } });
    expect(dup.status).toBe(409);
    expect(dup.json.message).toBe("Un compte existe déjà avec cet email");
  });

  it("reset-password sets a temporary password", async () => {
    const r = await post("users", { action: "reset-password", row: "bob" });
    expect(r.status).toBe(200);
    expect(r.json.reveal.value).toBe("Temp-Password-123");
    const bob = db.users.find((u) => u.id === "bob")!;
    expect(bob.mustChangePwd).toBe(true);
    expect(await verifyPassword("Temp-Password-123", bob.passwordHash)).toBe(true);
  });

  it("save-kosmy keeps the secret when the field is left empty", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    const r = await post("kosmy-board", {
      action: "save-kosmy",
      values: { issuer: ISSUER, clientId: CLIENT_ID, clientSecret: "", autoCreate: true },
    });
    expect(r.status).toBe(200);
    expect(r.json.message).toMatch(/ne répond pas/);
    expect(db.settings).toMatchObject({ clientSecret: "the-client-secret", autoCreate: true });
    const bad = await post("kosmy-board", { action: "save-kosmy", values: { issuer: "javascript:alert(1)", clientId: CLIENT_ID } });
    expect(bad.status).toBe(400);
  });

  it("refuses unreadable bodies", async () => {
    expect((await post("users", "{nope")).status).toBe(400);
    expect((await post("users", { action: 42 })).status).toBe(400);
    expect((await post("overview", { action: "anything" })).status).toBe(404);
  });
});
