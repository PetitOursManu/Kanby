/**
 * Users managed by Kosmy Board (protocol kosmy.board-users.v1), without a
 * database: the Board is faked with a test RSA key and a local JWKS, and the
 * accounts with a small in-memory store. Everything else is the real code:
 * token checks (shared with the admin in the Board), roles, restrictions,
 * guard rails, and the access sent in the ID token at sign-in.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK } from "jose";
import { JtiCache } from "@/lib/kosmy-board/admin-token";
import { verifyIdToken } from "@/lib/kosmy-board/oidc";
import { resolveKosmyAccount } from "@/lib/kosmy-board/accounts";
import { getTranslator } from "@/lib/i18n";
import {
  AccessError,
  applyAccess,
  handleBoardUsers,
  signInWithBoardAccess,
  type BoardUsersDeps,
  type ManagedUser,
  type UsersStore,
} from "@/lib/kosmy-board/users";

const ISSUER = "https://board.example.com/oidc";
const CLIENT_ID = "kanby-client";
const APP = "https://kanby.example.com";
const USERS = "/api/kosmy-board/users";

let boardKey: CryptoKey;
let jwks: ReturnType<typeof createLocalJWKSet>;
let users: ManagedUser[];
let seq = 0;
let deps: BoardUsersDeps;

const copy = (u: ManagedUser | undefined) => (u ? { ...u } : null);
const store: UsersStore = {
  findBySub: async (sub) => copy(users.find((u) => u.kosmySub === sub)),
  findByEmail: async (email) => copy(users.find((u) => u.email === email)),
  listLinked: async (limit) => users.filter((u) => u.kosmySub).slice(0, limit).map((u) => ({ ...u })),
  countActiveAdmins: async () => users.filter((u) => u.globalRole === "ADMIN" && u.active).length,
  create: async (data) => {
    const u = { id: `new${++seq}`, mustChangePwd: false, ...data };
    users.push(u);
    return { ...u };
  },
  update: async (id, data) => {
    const u = users.find((x) => x.id === id)!;
    Object.assign(u, data);
    return { ...u };
  },
};
const byId = (id: string) => users.find((u) => u.id === id)!;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  boardKey = pair.privateKey as CryptoKey;
  const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  jwks = createLocalJWKSet({ keys: [jwk] });
});

beforeEach(() => {
  const base = { mustChangePwd: false, locale: null, maxBoards: null, canUseApi: true };
  users = [
    { ...base, id: "admin", email: "admin@kanby.local", displayName: "Ada", globalRole: "ADMIN", active: true, kosmySub: "sub-admin" },
    { ...base, id: "bob", email: "bob@example.com", displayName: "Bob", globalRole: "USER", active: true, kosmySub: "sub-bob", maxBoards: 2 },
    { ...base, id: "old", email: "old@example.com", displayName: "Old", globalRole: "USER", active: false, kosmySub: "sub-old" },
    // Not linked to the Board (created in Kanby itself).
    { ...base, id: "carl", email: "carl@example.com", displayName: "Carl", globalRole: "USER", active: true, kosmySub: null },
  ];
  deps = {
    getSettings: async () => ({ issuer: ISSUER, clientId: CLIENT_ID }),
    discover: async () => ({ doc: { issuer: ISSUER }, jwks }),
    findUserBySub: store.findBySub,
    jti: new JtiCache(),
    users: store,
  };
});

/** A token as the Board makes it (docs/admin-api.md), with overridable parts. */
function boardToken(o: { method?: string; path?: string; typ?: string; sub?: string; jti?: string } = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ htm: o.method ?? "GET", htu: `${APP}${o.path ?? USERS}` })
    .setProtectedHeader({ alg: "RS256", kid: "k1", typ: o.typ ?? "kb-admin+jwt" })
    .setIssuer(ISSUER)
    .setAudience(CLIENT_ID)
    .setSubject(o.sub ?? "sub-admin")
    .setIssuedAt(now)
    .setExpirationTime(now + 60)
    .setJti(o.jti ?? crypto.randomUUID())
    .sign(boardKey);
}

async function call(path: string, o: { method?: string; token?: string | null; body?: unknown; lang?: string; actor?: string } = {}) {
  const method = o.method ?? "GET";
  const token = o.token === undefined ? await boardToken({ method, path, sub: o.actor }) : o.token;
  const headers: Record<string, string> = { "accept-language": o.lang ?? "fr" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (o.body !== undefined) headers["content-type"] = "application/json";
  const req = new Request(`${APP}${path}`, {
    method,
    headers,
    body: o.body === undefined ? undefined : typeof o.body === "string" ? o.body : JSON.stringify(o.body),
  });
  const target = path === USERS ? null : path.slice(USERS.length + 1);
  const res = await handleBoardUsers(req, target, deps);
  return { status: res.status, json: (await res.json()) as any, headers: res.headers };
}

const put = (sub: string, body: unknown, o: { lang?: string; actor?: string } = {}) =>
  call(`${USERS}/${sub}`, { method: "PUT", body, ...o });
const del = (sub: string, o: { lang?: string; actor?: string } = {}) => call(`${USERS}/${sub}`, { method: "DELETE", ...o });

describe("GET /api/kosmy-board/users", () => {
  it("describes Kanby's roles and restrictions", async () => {
    const r = await call(USERS);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("access-control-allow-origin")).toBeNull();
    expect(r.json.protocol).toBe("kosmy.board-users.v1");
    expect(r.json.roles).toEqual([
      { value: "admin", label: "Administrateur", description: expect.any(String), admin: true },
      { value: "member", label: "Utilisateur", description: expect.any(String) },
    ]);
    expect(r.json.defaultRole).toBe("member");
    expect(r.json.fields).toEqual([
      expect.objectContaining({ name: "maxBoards", type: "number", min: 0, max: 1000, step: 1, roles: ["member"] }),
      expect.objectContaining({ name: "canUseApi", type: "checkbox", value: true, roles: ["member"] }),
    ]);
    // An empty number means "no limit": no default value.
    expect(r.json.fields[0]).not.toHaveProperty("value");
    for (const f of r.json.fields) expect(f.type).not.toBe("password");
  });

  it("lists the accounts linked to the Board only, with their real state", async () => {
    const r = await call(USERS);
    expect(r.json.users).toEqual([
      { sub: "sub-admin", role: "admin", values: { canUseApi: true }, active: true, account: "admin@kanby.local" },
      { sub: "sub-bob", role: "member", values: { maxBoards: 2, canUseApi: true }, active: true, account: "bob@example.com" },
      { sub: "sub-old", role: "member", values: { canUseApi: true }, active: false, account: "old@example.com" },
    ]);
    expect(JSON.stringify(r.json)).not.toMatch(/passwordHash|carl/);
  });

  it("speaks English when the Board asks for it", async () => {
    const r = await call(USERS, { lang: "en-GB,en;q=0.9" });
    expect(r.json.roles[0].label).toBe("Administrator");
    expect(r.json.fields[0].label).toBe("Boards at most");
  });

  it("only answers GET", async () => {
    const r = await call(USERS, { method: "POST", body: {} });
    expect(r.status).toBe(405);
    expect(r.json.error).toBe("method_not_allowed");
  });
});

describe("PUT /api/kosmy-board/users/{sub}", () => {
  const dora = { name: "Dora Explorer", email: "Dora@Example.com", locale: "en", role: "member", values: { maxBoards: 3, canUseApi: false } };

  it("creates an account linked to the sub, without a usable password", async () => {
    const r = await put("sub-dora", dora);
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ ok: true, status: "created", account: "dora@example.com", message: "Compte Kanby créé." });
    const u = users.find((x) => x.kosmySub === "sub-dora")!;
    expect(u).toMatchObject({
      email: "dora@example.com",
      displayName: "Dora Explorer",
      globalRole: "USER",
      active: true,
      mustChangePwd: false,
      locale: "en",
      maxBoards: 3,
      canUseApi: false,
    });
    expect(u).not.toHaveProperty("passwordHash");
  });

  it("is idempotent: the same PUT twice leaves the account in the same state", async () => {
    await put("sub-dora", dora);
    const first = { ...users.find((x) => x.kosmySub === "sub-dora")! };
    const again = await put("sub-dora", dora);
    expect(again.json.status).toBe("updated");
    expect(users.filter((x) => x.kosmySub === "sub-dora")).toEqual([first]);
  });

  it("links an existing account that is not linked yet, by its email", async () => {
    const r = await put("sub-carl", { name: "Carl B.", email: "carl@example.com", role: "admin" }, { lang: "en" });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ ok: true, status: "linked", account: "carl@example.com", message: "Existing Kanby account linked by its email address." });
    expect(byId("carl")).toMatchObject({ kosmySub: "sub-carl", globalRole: "ADMIN", displayName: "Carl B." });
    expect(users).toHaveLength(4);
  });

  it("updates role, restrictions, name and email of a linked account", async () => {
    const r = await put("sub-bob", { name: "Robert", email: "robert@example.com", role: "member", values: { maxBoards: 0, canUseApi: false } });
    expect(r.json.status).toBe("updated");
    expect(byId("bob")).toMatchObject({ displayName: "Robert", email: "robert@example.com", maxBoards: 0, canUseApi: false });
    // An empty number means "no limit".
    await put("sub-bob", { role: "member", values: { maxBoards: "" } });
    expect(byId("bob").maxBoards).toBeNull();
    // Fields left out keep their value.
    await put("sub-bob", { role: "admin" });
    expect(byId("bob")).toMatchObject({ globalRole: "ADMIN", canUseApi: false, email: "robert@example.com" });
  });

  it("reactivates a deactivated account", async () => {
    const r = await put("sub-old", { role: "member" });
    expect(r.status).toBe(200);
    expect(byId("old").active).toBe(true);
  });

  it("409 when the email belongs to an account linked to another sub", async () => {
    const r = await put("sub-new", { name: "Eve", email: "bob@example.com", role: "member" });
    expect(r.status).toBe(409);
    expect(r.json).toEqual({ error: "conflict", message: "Cette adresse e-mail appartient déjà à un compte Kanby relié à une autre personne du Board." });
    expect(byId("bob").kosmySub).toBe("sub-bob");
    expect(users).toHaveLength(4);
  });

  it("409 when a linked account would take the email of another account", async () => {
    const r = await put("sub-bob", { email: "carl@example.com", role: "member" }, { lang: "en" });
    expect(r.status).toBe(409);
    expect(r.json.message).toBe("This email address is already used by another Kanby account.");
    expect(byId("bob").email).toBe("bob@example.com");
  });

  it("422 for values Kanby refuses, and nothing changes", async () => {
    const before = JSON.stringify(users);
    const bad = async (body: unknown, message: RegExp) => {
      const r = await put("sub-bob", body);
      expect(r.status).toBe(422);
      expect(r.json.error).toBe("invalid");
      expect(r.json.message).toMatch(message);
    };
    await bad({ role: "owner" }, /Rôle inconnu/);
    await bad({}, /Rôle inconnu/);
    await bad({ role: "member", values: { maxBoards: -1 } }, /Tableaux au plus : un nombre entier entre 0 et 1000/);
    await bad({ role: "member", values: { maxBoards: 1001 } }, /entre 0 et 1000/);
    await bad({ role: "member", values: { maxBoards: 2.5 } }, /entre 0 et 1000/);
    await bad({ role: "member", values: { maxBoards: "beaucoup" } }, /entre 0 et 1000/);
    await bad({ role: "member", values: { canUseApi: "yes" } }, /Peut utiliser l'API : oui ou non/);
    await bad({ role: "member", values: [1] }, /Restrictions illisibles/);
    await bad({ role: "member", email: "not-an-email" }, /e-mail invalide/);
    expect(JSON.stringify(users)).toBe(before);
    // Creating an account needs an email.
    const r = await put("sub-noemail", { name: "No mail", role: "member" });
    expect(r.status).toBe(422);
    expect(users).toHaveLength(4);
  });

  it("refuses an unreadable body and a malformed sub", async () => {
    expect((await put("sub-bob", "{nope")).status).toBe(400);
    expect((await put("sub-bob", [1, 2])).status).toBe(400);
    const r = await put("not_a_sub!", { role: "member" });
    expect(r.status).toBe(404);
    expect(r.json.error).toBe("not_found");
  });
});

describe("DELETE /api/kosmy-board/users/{sub}", () => {
  it("deactivates the account (its data stays); it can no longer sign in", async () => {
    const r = await del("sub-bob");
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ ok: true });
    expect(byId("bob")).toMatchObject({ active: false, email: "bob@example.com", maxBoards: 2 });

    // Sign-in through the Board, with or without the managed access.
    const repo = {
      findBySub: store.findBySub,
      findById: async () => null,
      emailTaken: async () => true,
      createUser: async () => {
        throw new Error("never");
      },
      setSub: async () => {},
    };
    const plain = await resolveKosmyAccount({ sub: "sub-bob" }, { autoCreate: true }, repo);
    expect(plain).toEqual({ ok: false, error: "inactive" });
    const managed = await signInWithBoardAccess({ sub: "sub-bob", access: { role: "member", values: {} } }, store);
    expect(managed).toEqual({ ok: false, error: "inactive" });
    expect(byId("bob").active).toBe(false);

    // A PUT gives the access back.
    await put("sub-bob", { role: "member" });
    expect(byId("bob").active).toBe(true);
  });

  it("answers ok when there is nothing to take away", async () => {
    expect((await del("sub-nobody")).json).toEqual({ ok: true });
    expect((await del("sub-old")).json).toEqual({ ok: true });
  });
});

describe("guard rails", () => {
  it("you cannot take your own admin rights away", async () => {
    const r = await put("sub-admin", { role: "member" });
    expect(r.status).toBe(409);
    expect(r.json).toEqual({ error: "conflict", message: "Vous ne pouvez pas vous retirer vos propres droits d'administration." });
    expect(byId("admin").globalRole).toBe("ADMIN");
    // Updating yourself while staying an administrator is fine.
    expect((await put("sub-admin", { name: "Ada L.", role: "admin" })).status).toBe(200);
  });

  it("you cannot remove your own access", async () => {
    const r = await del("sub-admin", { lang: "en" });
    expect(r.status).toBe(409);
    expect(r.json).toEqual({ error: "conflict", message: "You cannot remove your own access." });
    expect(byId("admin").active).toBe(true);
  });

  it("Kanby always keeps an active administrator", async () => {
    // Through the protocol the person who acts is itself an active administrator who cannot
    // demote or remove themselves, so this is checked on the shared function directly.
    const t = getTranslator("fr");
    const err = await applyAccess("sub-admin", { role: "member" }, store, t, { actorSub: "sub-someone-else" }).catch((e) => e);
    expect(err).toBeInstanceOf(AccessError);
    expect(err).toMatchObject({ status: 409, userMessage: "Kanby doit garder au moins un administrateur actif." });
    expect(byId("admin").globalRole).toBe("ADMIN");
    // With a second active administrator, the first one can lose the role.
    byId("bob").globalRole = "ADMIN";
    await applyAccess("sub-admin", { role: "member" }, store, t, { actorSub: "sub-bob" });
    expect(byId("admin").globalRole).toBe("USER");
  });

  it("the token's person must be an active Kanby administrator", async () => {
    const member = await put("sub-dora", { email: "dora@example.com", role: "admin" }, { actor: "sub-bob" });
    expect(member.status).toBe(403);
    expect(member.json.error).toBe("forbidden");
    const inactive = await call(USERS, { actor: "sub-old" });
    expect(inactive.status).toBe(403);
    const unknown = await call(USERS, { actor: "sub-unknown", lang: "en" });
    expect(unknown.status).toBe(403);
    expect(unknown.json.error).toBe("not_linked");
    expect(users).toHaveLength(4);
  });
});

describe("the Board's token", () => {
  const refused = async (r: { status: number; json: any }) => {
    expect(r.status).toBe(401);
    expect(r.json.error).toBe("invalid_token");
    expect(typeof r.json.message).toBe("string");
  };

  it("is required and must be a kb-admin+jwt", async () => {
    await refused(await call(USERS, { token: null }));
    await refused(await call(USERS, { token: "nope" }));
    await refused(await call(USERS, { token: await boardToken({ typ: "JWT" }) }));
  });

  it("is made for this method (htm)", async () => {
    const token = await boardToken({ method: "GET", path: `${USERS}/sub-bob` });
    await refused(await call(`${USERS}/sub-bob`, { method: "DELETE", token }));
    const forPut = await boardToken({ method: "PUT", path: `${USERS}/sub-bob` });
    await refused(await call(`${USERS}/sub-bob`, { method: "DELETE", token: forPut }));
    expect(byId("bob").active).toBe(true);
  });

  it("is made for this address (htu), {sub} included", async () => {
    await refused(await call(`${USERS}/sub-bob`, { method: "DELETE", token: await boardToken({ method: "DELETE", path: `${USERS}/sub-old` }) }));
    await refused(await call(`${USERS}/sub-bob`, { method: "DELETE", token: await boardToken({ method: "DELETE", path: USERS }) }));
    await refused(await call(USERS, { token: await boardToken({ path: "/api/kosmy-board/admin" }) }));
    await refused(await call(USERS, { token: await boardToken({ path: `${USERS}/sub-bob` }) }));
    expect(byId("bob").active).toBe(true);
  });

  it("is single use", async () => {
    const token = await boardToken();
    expect((await call(USERS, { token })).status).toBe(200);
    await refused(await call(USERS, { token }));
  });

  it("is refused when Kosmy Board sign-in is not configured", async () => {
    deps.getSettings = async () => null;
    await refused(await call(USERS));
  });
});

describe("sign-in with kosmy_board_access", () => {
  it("the ID token carries the access", async () => {
    const now = Math.floor(Date.now() / 1000);
    const sign = (extra: Record<string, unknown>) =>
      new SignJWT({ nonce: "n0nce", email: "dora@example.com", ...extra })
        .setProtectedHeader({ alg: "RS256", kid: "k1" })
        .setIssuer(ISSUER)
        .setAudience(CLIENT_ID)
        .setSubject("sub-dora")
        .setIssuedAt(now)
        .setExpirationTime(now + 60)
        .sign(boardKey);
    const p = { issuer: ISSUER, clientId: CLIENT_ID, nonce: "n0nce", jwks };
    const claims = await verifyIdToken(await sign({ kosmy_board_access: { role: "member", values: { maxBoards: 1 } } }), p);
    expect(claims.access).toEqual({ role: "member", values: { maxBoards: 1 } });
    expect((await verifyIdToken(await sign({}), p)).access).toBeUndefined();
    expect((await verifyIdToken(await sign({ kosmy_board_access: "admin" }), p)).access).toBeUndefined();
  });

  it("creates the account with the role and restrictions given in the Board", async () => {
    const r = await signInWithBoardAccess(
      { sub: "sub-dora", name: "Dora", email: "dora@example.com", locale: "fr-FR", access: { role: "member", values: { maxBoards: 1, canUseApi: false } } },
      store,
    );
    expect(r).toMatchObject({ ok: true, created: true });
    expect(users.find((u) => u.kosmySub === "sub-dora")).toMatchObject({ globalRole: "USER", maxBoards: 1, canUseApi: false, locale: "fr", active: true });
  });

  it("updates an existing account like a PUT", async () => {
    const r = await signInWithBoardAccess({ sub: "sub-bob", email: "bob@example.com", access: { role: "admin", values: { canUseApi: false } } }, store);
    expect(r).toMatchObject({ ok: true, created: false });
    expect(byId("bob")).toMatchObject({ globalRole: "ADMIN", maxBoards: 2, canUseApi: false });
  });

  it("never links an existing account by its email", async () => {
    const r = await signInWithBoardAccess({ sub: "sub-intruder", email: "carl@example.com", access: { role: "admin" } }, store);
    expect(r).toEqual({ ok: false, error: "email_taken" });
    expect(byId("carl")).toMatchObject({ kosmySub: null, globalRole: "USER" });
    expect(await signInWithBoardAccess({ sub: "sub-x", email: "bob@example.com", access: { role: "member" } }, store)).toEqual({
      ok: false,
      error: "email_taken",
    });
  });

  it("refuses an access Kanby does not know, and never demotes the last administrator", async () => {
    expect(await signInWithBoardAccess({ sub: "sub-bob", access: { role: "owner" } }, store)).toEqual({ ok: false, error: "access" });
    expect(await signInWithBoardAccess({ sub: "sub-new", access: { role: "member" } }, store)).toEqual({ ok: false, error: "no_email" });
    const r = await signInWithBoardAccess({ sub: "sub-admin", access: { role: "member" } }, store);
    expect(r).toMatchObject({ ok: true });
    expect(byId("admin").globalRole).toBe("ADMIN");
  });
});
