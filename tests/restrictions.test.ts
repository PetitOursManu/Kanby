/**
 * Per-user restrictions given by an administrator (from Kosmy Board,
 * kosmy.board-users.v1): each field Kanby offers to the Board is enforced.
 * Prisma is faked with a small in-memory store; the route handlers are real.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";

type Row = Record<string, any>;

const { db, fakePrisma } = vi.hoisted(() => {
  const db = { users: [] as Row[], boards: [] as Row[], tokens: [] as Row[], seq: 0 };
  const fakePrisma = {
    user: {
      findUnique: async ({ where }: Row) => db.users.find((u) => (where.id ? u.id === where.id : u.email === where.email)) ?? null,
    },
    board: {
      count: async ({ where }: Row) => db.boards.filter((b) => b.ownerId === where.ownerId).length,
      create: async ({ data }: Row) => {
        const b = { id: `b${++db.seq}`, name: data.name, type: data.type, ownerId: data.ownerId, columns: [] };
        db.boards.push(b);
        return b;
      },
    },
    apiToken: {
      create: async ({ data }: Row) => {
        const t = { id: `t${++db.seq}`, createdAt: new Date(), revokedAt: null, ...data };
        db.tokens.push(t);
        return t;
      },
      findUnique: async ({ where }: Row) => {
        const t = db.tokens.find((x) => x.tokenHash === where.tokenHash);
        return t ? { ...t, user: db.users.find((u) => u.id === t.userId) } : null;
      },
      update: async () => ({}),
    },
  };
  return { db, fakePrisma };
});

vi.mock("@/lib/prisma", () => ({ prisma: fakePrisma }));
vi.mock("next/headers", () => ({ cookies: () => ({ set: () => {}, get: () => undefined }) }));

import { boardLimit, mayUseApi } from "@/lib/restrictions";
import { createApiToken, resolveApiTokenUser } from "@/lib/auth/token";
import { signSession } from "@/lib/auth/jwt";
import { POST as createBoard } from "@/app/api/boards/route";
import { POST as createToken } from "@/app/api/me/tokens/route";
import { POST as mobileToken } from "@/app/api/auth/token/route";

const APP = "https://kanby.example.com";

beforeEach(async () => {
  process.env.JWT_SECRET = "test-secret-for-restrictions-0123456789";
  const base = { active: true, mustChangePwd: false, maxBoards: null, canUseApi: true, passwordHash: await bcrypt.hash("password-123", 4) };
  db.users = [
    { ...base, id: "admin", email: "admin@kanby.local", displayName: "Ada", globalRole: "ADMIN", maxBoards: 0, canUseApi: false },
    { ...base, id: "bob", email: "bob@example.com", displayName: "Bob", globalRole: "USER", maxBoards: 1 },
    { ...base, id: "zoe", email: "zoe@example.com", displayName: "Zoé", globalRole: "USER", maxBoards: 0, canUseApi: false },
    { ...base, id: "max", email: "max@example.com", displayName: "Max", globalRole: "USER" },
  ];
  db.boards = [];
  db.tokens = [];
});

function request(path: string, o: { as?: string; body?: unknown; bearer?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` };
  if (o.as) {
    const u = db.users.find((x) => x.id === o.as)!;
    headers.cookie = `kanby_session=${signSession({ sub: u.id, role: u.globalRole }, 3600)}`;
  }
  if (o.bearer) headers.authorization = `Bearer ${o.bearer}`;
  return new NextRequest(`${APP}${path}`, { method: "POST", headers, body: JSON.stringify(o.body ?? {}) });
}

describe("rules", () => {
  it("administrators are never restricted", () => {
    const admin = db.users[0] as any;
    expect(boardLimit(admin)).toBeNull();
    expect(mayUseApi(admin)).toBe(true);
    expect(boardLimit(db.users[1] as any)).toBe(1);
    expect(boardLimit(db.users[3] as any)).toBeNull();
    expect(mayUseApi(db.users[2] as any)).toBe(false);
  });
});

describe("maxBoards: most boards a user may own", () => {
  it("refuses a board beyond the limit", async () => {
    const first = await createBoard(request("/api/boards", { as: "bob", body: { name: "One", type: "PERSONAL" } }));
    expect(first.status).toBe(201);
    const second = await createBoard(request("/api/boards", { as: "bob", body: { name: "Two", type: "TEAM" } }));
    expect(second.status).toBe(403);
    expect((await second.json()).error).toBe("Nombre maximal de tableaux atteint pour votre compte");
    expect(db.boards).toHaveLength(1);
  });

  it("0: no board of their own; empty: no limit; administrators: no limit", async () => {
    expect((await createBoard(request("/api/boards", { as: "zoe", body: { name: "Nope" } }))).status).toBe(403);
    for (const name of ["A", "B", "C"]) {
      expect((await createBoard(request("/api/boards", { as: "max", body: { name } }))).status).toBe(201);
      expect((await createBoard(request("/api/boards", { as: "admin", body: { name } }))).status).toBe(201);
    }
  });
});

describe("canUseApi: API tokens (mobile API, widget)", () => {
  it("existing tokens stop working, and work again once allowed", async () => {
    const { raw } = await createApiToken("bob", "phone");
    expect((await resolveApiTokenUser(raw))?.id).toBe("bob");
    db.users.find((u) => u.id === "bob")!.canUseApi = false;
    expect(await resolveApiTokenUser(raw)).toBeNull();
    db.users.find((u) => u.id === "bob")!.canUseApi = true;
    expect((await resolveApiTokenUser(raw))?.id).toBe("bob");
  });

  it("no new token from the profile", async () => {
    const r = await createToken(request("/api/me/tokens", { as: "zoe", body: { label: "x" } }));
    expect(r.status).toBe(403);
    expect((await r.json()).error).toBe("L'accès à l'API est désactivé pour votre compte");
    expect((await createToken(request("/api/me/tokens", { as: "max", body: { label: "x" } }))).status).toBe(201);
    expect(db.tokens.map((t) => t.userId)).toEqual(["max"]);
  });

  it("no token from the mobile sign-in, once the password is checked", async () => {
    const wrong = await mobileToken(request("/api/auth/token", { body: { email: "zoe@example.com", password: "nope-nope" } }));
    expect(wrong.status).toBe(401);
    const r = await mobileToken(request("/api/auth/token", { body: { email: "zoe@example.com", password: "password-123" } }));
    expect(r.status).toBe(403);
    expect(db.tokens).toHaveLength(0);
    const ok = await mobileToken(request("/api/auth/token", { body: { email: "admin@kanby.local", password: "password-123" } }));
    expect(ok.status).toBe(200);
  });
});
