/**
 * Admin in Kosmy Board against a running Kanby: a fake Board (discovery +
 * JWKS on a local port, test RSA key) is configured as the Kosmy Board issuer
 * for the duration of the file, then the previous settings are restored.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { BASE, api, createUser, prisma, type TestUser } from "./helpers";

const ADMIN_PATH = "/api/kosmy-board/admin";
const CLIENT_ID = `kanby-api-test-${crypto.randomUUID().slice(0, 8)}`;

let board: http.Server;
let issuer = "";
let key: CryptoKey;
let previous: Awaited<ReturnType<typeof prisma.kosmyBoardSettings.findUnique>>;
let admin: TestUser;
let member: TestUser;
let adminSub = "";
let memberSub = "";

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  key = pair.privateKey as CryptoKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: "test-key", alg: "RS256", use: "sig" };

  board = http.createServer((req, res) => {
    const send = (body: unknown) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.url === "/oidc/.well-known/openid-configuration") {
      return send({
        issuer,
        authorization_endpoint: `${issuer}/auth`,
        token_endpoint: `${issuer}/token`,
        jwks_uri: `${issuer}/jwks`,
      });
    }
    if (req.url === "/oidc/jwks") return send({ keys: [jwk] });
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => board.listen(0, "127.0.0.1", resolve));
  issuer = `http://127.0.0.1:${(board.address() as AddressInfo).port}/oidc`;

  previous = await prisma.kosmyBoardSettings.findUnique({ where: { id: 1 } });
  const data = { issuer, clientId: CLIENT_ID, clientSecret: "test-secret", autoCreate: false };
  await prisma.kosmyBoardSettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });

  admin = await createUser({ role: "ADMIN", name: "Board Admin" });
  member = await createUser({ name: "Board Member" });
  adminSub = `sub-${crypto.randomUUID()}`;
  memberSub = `sub-${crypto.randomUUID()}`;
  await prisma.user.update({ where: { id: admin.id }, data: { kosmySub: adminSub } });
  await prisma.user.update({ where: { id: member.id }, data: { kosmySub: memberSub } });
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

function token(o: { method?: string; path?: string; typ?: string; aud?: string; sub?: string; jti?: string } = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ htm: o.method ?? "GET", htu: `${BASE}${o.path ?? ADMIN_PATH}` })
    .setProtectedHeader({ alg: "RS256", kid: "test-key", typ: o.typ ?? "kb-admin+jwt" })
    .setIssuer(issuer)
    .setAudience(o.aud ?? CLIENT_ID)
    .setSubject(o.sub ?? adminSub)
    .setIssuedAt(now)
    .setExpirationTime(now + 60)
    .setJti(o.jti ?? crypto.randomUUID())
    .sign(key);
}

async function call(path: string, o: { method?: string; bearer?: string; body?: unknown } = {}) {
  const method = o.method ?? "GET";
  const bearer = o.bearer ?? (await token({ method, path }));
  return api(path, { method, body: o.body, headers: { authorization: `Bearer ${bearer}`, "accept-language": "fr" } });
}

describe("admin in Kosmy Board (live server)", () => {
  it("answers the summary to a valid token, without session cookie, redirect or CORS", async () => {
    const r = await call(ADMIN_PATH);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(r.headers.get("cache-control")).toContain("no-store");
    expect(r.headers.get("access-control-allow-origin")).toBeNull();
    expect(r.json.protocol).toBe("kosmy.board-admin.v1");
    expect(r.json.user.name).toBe("Board Admin");
    expect(r.json.sections.map((s: { id: string }) => s.id)).toEqual(["overview", "users", "boards", "kosmy-board"]);
  });

  it("refuses an ID-token-like JWT (typ JWT), even signed by the Board", async () => {
    const r = await call(ADMIN_PATH, { bearer: await token({ typ: "JWT" }) });
    expect(r.status).toBe(401);
    expect(r.json.error).toBe("invalid_token");
  });

  it("refuses another audience", async () => {
    const r = await call(ADMIN_PATH, { bearer: await token({ aud: "someone-else" }) });
    expect(r.status).toBe(401);
  });

  it("refuses a replayed token", async () => {
    const bearer = await token();
    expect((await call(ADMIN_PATH, { bearer })).status).toBe(200);
    const again = await call(ADMIN_PATH, { bearer });
    expect(again.status).toBe(401);
    expect(again.json.error).toBe("invalid_token");
  });

  it("refuses a token made for another method or address", async () => {
    const users = `${ADMIN_PATH}/users`;
    const wrongMethod = await call(users, { method: "POST", bearer: await token({ method: "GET", path: users }), body: { action: "make-admin", row: member.id } });
    expect(wrongMethod.status).toBe(401);
    const wrongPath = await call(users, { bearer: await token({ path: `${ADMIN_PATH}/boards` }) });
    expect(wrongPath.status).toBe(401);
    expect((await prisma.user.findUnique({ where: { id: member.id } }))?.globalRole).toBe("USER");
  });

  it("not_linked when no Kanby account has this sub", async () => {
    const r = await call(ADMIN_PATH, { bearer: await token({ sub: `sub-${crypto.randomUUID()}` }) });
    expect(r.status).toBe(403);
    expect(r.json.error).toBe("not_linked");
    expect(r.json.message).toBeTruthy();
  });

  it("forbidden for a linked account without admin rights", async () => {
    const r = await call(ADMIN_PATH, { bearer: await token({ sub: memberSub }) });
    expect(r.status).toBe(403);
    expect(r.json.error).toBe("forbidden");
  });

  it("serves a section", async () => {
    const r = await call(`${ADMIN_PATH}/users`);
    expect(r.status).toBe(200);
    const table = r.json.blocks.find((b: { type: string }) => b.type === "table");
    const row = table.rows.find((x: { id: string }) => x.id === member.id);
    expect(row.actions).toContain("make-admin");
    expect(JSON.stringify(r.json)).not.toContain("passwordHash");
  });

  it("runs an action with Kanby's own rules", async () => {
    const path = `${ADMIN_PATH}/users`;
    const r = await call(path, { method: "POST", body: { action: "make-admin", row: member.id } });
    expect(r.status).toBe(200);
    expect(r.json.ok).toBe(true);
    expect(r.json.section.id).toBe("users");
    expect((await prisma.user.findUnique({ where: { id: member.id } }))?.globalRole).toBe("ADMIN");

    const self = await call(path, { method: "POST", body: { action: "delete", row: admin.id } });
    expect(self.status).toBe(400);
    expect(await prisma.user.findUnique({ where: { id: admin.id } })).not.toBeNull();
  });

  it("never sends the client secret", async () => {
    const r = await call(`${ADMIN_PATH}/kosmy-board`);
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.json)).not.toContain("test-secret");
  });
});
