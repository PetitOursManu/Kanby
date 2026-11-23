/**
 * Users managed by Kosmy Board (kosmy.board-users.v1) against a running Kanby:
 * a fake Board (discovery, JWKS and token endpoint on a local port, test RSA
 * key) is configured as the Kosmy Board issuer for the duration of the file,
 * then the previous settings are restored.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { FLOW_COOKIE, signFlow } from "@/lib/kosmy-board/oidc";
import { BASE, api, createUser, fakeIp, prisma, sessionCookie, uniqueEmail, type TestUser } from "./helpers";

const USERS = "/api/kosmy-board/users";
const CLIENT_ID = `kanby-users-test-${crypto.randomUUID().slice(0, 8)}`;

let board: http.Server;
let issuer = "";
let key: CryptoKey;
let previous: Awaited<ReturnType<typeof prisma.kosmyBoardSettings.findUnique>>;
let admin: TestUser;
let adminSub = "";
/** What the fake Board puts in the next ID token. */
let nextIdToken: { sub: string; nonce: string; email: string; access?: unknown } | null = null;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  key = pair.privateKey as CryptoKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: "test-key", alg: "RS256", use: "sig" };

  board = http.createServer(async (req, res) => {
    const send = (body: unknown) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.url === "/oidc/.well-known/openid-configuration") {
      return send({ issuer, authorization_endpoint: `${issuer}/auth`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks` });
    }
    if (req.url === "/oidc/jwks") return send({ keys: [jwk] });
    if (req.url === "/oidc/token" && nextIdToken) {
      const now = Math.floor(Date.now() / 1000);
      const { sub, nonce, email, access } = nextIdToken;
      const idToken = await new SignJWT({ nonce, email, name: "Signed In", ...(access ? { kosmy_board_access: access } : {}) })
        .setProtectedHeader({ alg: "RS256", kid: "test-key" })
        .setIssuer(issuer)
        .setAudience(CLIENT_ID)
        .setSubject(sub)
        .setIssuedAt(now)
        .setExpirationTime(now + 300)
        .sign(key);
      return send({ access_token: "at", token_type: "Bearer", id_token: idToken });
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => board.listen(0, "127.0.0.1", resolve));
  issuer = `http://127.0.0.1:${(board.address() as AddressInfo).port}/oidc`;

  previous = await prisma.kosmyBoardSettings.findUnique({ where: { id: 1 } });
  const data = { issuer, clientId: CLIENT_ID, clientSecret: "test-secret", autoCreate: false };
  await prisma.kosmyBoardSettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });

  admin = await createUser({ role: "ADMIN", name: "Board Admin" });
  adminSub = crypto.randomUUID();
  await prisma.user.update({ where: { id: admin.id }, data: { kosmySub: adminSub } });
});

afterAll(async () => {
  if (previous) {
    const { id: _id, updatedAt: _u, ...rest } = previous;
    await prisma.kosmyBoardSettings.update({ where: { id: 1 }, data: rest });
  } else {
    await prisma.kosmyBoardSettings.deleteMany({});
  }
  await new Promise((resolve) => board.close(resolve));
  await prisma.$disconnect();
});

function token(o: { method?: string; path?: string; sub?: string } = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ htm: o.method ?? "GET", htu: `${BASE}${o.path ?? USERS}` })
    .setProtectedHeader({ alg: "RS256", kid: "test-key", typ: "kb-admin+jwt" })
    .setIssuer(issuer)
    .setAudience(CLIENT_ID)
    .setSubject(o.sub ?? adminSub)
    .setIssuedAt(now)
    .setExpirationTime(now + 60)
    .setJti(crypto.randomUUID())
    .sign(key);
}

async function call(path: string, o: { method?: string; bearer?: string; body?: unknown; lang?: string } = {}) {
  const method = o.method ?? "GET";
  const bearer = o.bearer ?? (await token({ method, path }));
  return api(path, { method, body: o.body, headers: { authorization: `Bearer ${bearer}`, "accept-language": o.lang ?? "fr" } });
}

/** Come back from the fake Board with an ID token for `sub` (and the access, if any). */
async function signIn(sub: string, email: string, access?: unknown) {
  const flow = { state: crypto.randomUUID(), nonce: crypto.randomUUID(), verifier: crypto.randomUUID() + crypto.randomUUID(), iss: issuer, target: "/boards", mode: "login" as const };
  nextIdToken = { sub, nonce: flow.nonce, email, access };
  const res = await fetch(`${BASE}/auth/kosmy-board/callback?code=c0de&state=${flow.state}&iss=${encodeURIComponent(issuer)}`, {
    headers: { cookie: `${FLOW_COOKIE}=${signFlow(flow)}`, "x-forwarded-for": fakeIp() },
    redirect: "manual",
  });
  nextIdToken = null;
  return { status: res.status, location: res.headers.get("location") ?? "", session: /kanby_session=[^;]+/.test(res.headers.get("set-cookie") ?? "") };
}

describe("users managed by Kosmy Board (live server)", () => {
  it("GET describes the roles and restrictions, and lists linked accounts", async () => {
    const r = await call(USERS);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(r.headers.get("cache-control")).toContain("no-store");
    expect(r.headers.get("access-control-allow-origin")).toBeNull();
    expect(r.json.protocol).toBe("kosmy.board-users.v1");
    expect(r.json.roles.map((x: { value: string }) => x.value)).toEqual(["admin", "member"]);
    expect(r.json.roles[0].admin).toBe(true);
    expect(r.json.fields.map((f: { name: string }) => f.name)).toEqual(["maxBoards", "canUseApi"]);
    expect(r.json.users).toContainEqual({ sub: adminSub, role: "admin", values: { canUseApi: true }, active: true, account: admin.email });
    expect(JSON.stringify(r.json)).not.toContain("passwordHash");
  });

  it("PUT creates, then updates, an account without a usable password", async () => {
    const sub = crypto.randomUUID();
    const email = uniqueEmail("board");
    const body = { name: "Created By Board", email, locale: "en", role: "member", values: { maxBoards: 0, canUseApi: false } };
    const r = await call(`${USERS}/${sub}`, { method: "PUT", body });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ ok: true, status: "created", account: email });
    const u = await prisma.user.findUnique({ where: { kosmySub: sub } });
    expect(u).toMatchObject({ email, displayName: "Created By Board", globalRole: "USER", active: true, mustChangePwd: false, locale: "en", maxBoards: 0, canUseApi: false });

    // Its restrictions apply: no board of its own.
    const cookie = sessionCookie(u!);
    const boardRes = await api("/api/boards", { body: { name: "Nope" }, headers: { cookie } });
    expect(boardRes.status).toBe(403);

    const again = await call(`${USERS}/${sub}`, { method: "PUT", body: { ...body, values: { maxBoards: 5 } } });
    expect(again.json.status).toBe("updated");
    expect(await prisma.user.findUnique({ where: { kosmySub: sub } })).toMatchObject({ maxBoards: 5, canUseApi: false });
    expect((await api("/api/boards", { body: { name: "Yes" }, headers: { cookie } })).status).toBe(201);
  });

  it("PUT links an unlinked account by email, and refuses an email linked to someone else", async () => {
    const carl = await createUser({ name: "Carl" });
    const sub = crypto.randomUUID();
    const r = await call(`${USERS}/${sub}`, { method: "PUT", body: { email: carl.email, role: "member" } });
    expect(r.json.status).toBe("linked");
    expect((await prisma.user.findUnique({ where: { id: carl.id } }))?.kosmySub).toBe(sub);

    const other = await call(`${USERS}/${crypto.randomUUID()}`, { method: "PUT", body: { email: carl.email, role: "member" } });
    expect(other.status).toBe(409);
    expect(other.json.error).toBe("conflict");
    expect(other.json.message).toBeTruthy();
  });

  it("PUT refuses invalid values (422)", async () => {
    const r = await call(`${USERS}/${crypto.randomUUID()}`, { method: "PUT", body: { email: uniqueEmail(), role: "member", values: { maxBoards: 99999 } }, lang: "en" });
    expect(r.status).toBe(422);
    expect(r.json.message).toMatch(/between 0 and 1000/);
  });

  it("DELETE deactivates: password, session, API token and Board sign-in are refused", async () => {
    const dan = await createUser({ name: "Dan" });
    const sub = crypto.randomUUID();
    await prisma.user.update({ where: { id: dan.id }, data: { kosmySub: sub } });
    const tokenRes = await api("/api/me/tokens", { as: dan, body: { label: "phone" } });
    expect(tokenRes.status).toBe(201);
    const apiToken = tokenRes.json.raw as string;

    const r = await call(`${USERS}/${sub}`, { method: "DELETE" });
    expect(r.status).toBe(200);
    expect(r.json.ok).toBe(true);
    expect((await prisma.user.findUnique({ where: { id: dan.id } }))?.active).toBe(false);

    expect((await api("/api/boards", { as: dan })).status).toBe(401);
    expect((await api("/api/boards", { headers: { authorization: `Bearer ${apiToken}` } })).status).toBe(401);
    const login = await api("/api/auth/login", { body: { email: dan.email, password: dan.password }, headers: { "x-forwarded-for": fakeIp() } });
    expect(login.status).toBe(401);
    const board = await signIn(sub, dan.email, { role: "member", values: {} });
    expect(board.location).toContain("kosmy_error=inactive");
    expect(board.session).toBe(false);

    // A PUT gives the access back.
    await call(`${USERS}/${sub}`, { method: "PUT", body: { role: "member" } });
    expect((await api("/api/boards", { as: dan })).status).toBe(200);
  });

  it("never lets the person who acts lock themselves out", async () => {
    const demote = await call(`${USERS}/${adminSub}`, { method: "PUT", body: { role: "member" } });
    expect(demote.status).toBe(409);
    const remove = await call(`${USERS}/${adminSub}`, { method: "DELETE" });
    expect(remove.status).toBe(409);
    expect(await prisma.user.findUnique({ where: { id: admin.id } })).toMatchObject({ globalRole: "ADMIN", active: true });
  });

  it("refuses a token made for another method or address", async () => {
    const sub = crypto.randomUUID();
    const path = `${USERS}/${sub}`;
    const body = { email: uniqueEmail(), role: "member" };
    expect((await call(path, { method: "PUT", body, bearer: await token({ method: "DELETE", path }) })).status).toBe(401);
    expect((await call(path, { method: "PUT", body, bearer: await token({ method: "PUT", path: USERS }) })).status).toBe(401);
    expect((await call(USERS, { bearer: await token({ path: "/api/kosmy-board/admin" }) })).status).toBe(401);
    expect(await prisma.user.findUnique({ where: { kosmySub: sub } })).toBeNull();
  });

  it("sign-in with kosmy_board_access creates the account even without auto-creation", async () => {
    const sub = crypto.randomUUID();
    const email = uniqueEmail("signin");
    const r = await signIn(sub, email, { role: "member", values: { maxBoards: 2, canUseApi: false } });
    expect(r.status).toBe(303);
    expect(r.location).toContain("/boards");
    expect(r.session).toBe(true);
    expect(await prisma.user.findUnique({ where: { kosmySub: sub } })).toMatchObject({ email, maxBoards: 2, canUseApi: false, globalRole: "USER" });

    // Without the claim, sign-in is unchanged: auto-creation is off.
    const plain = await signIn(crypto.randomUUID(), uniqueEmail("plain"));
    expect(plain.location).toContain("kosmy_error=not_linked");
  });
});
