/**
 * Helpers for the API integration suite.
 *
 * The suite runs against a live Kanby server (`KANBY_TEST_URL`, e.g.
 * http://localhost:3005) backed by a real PostgreSQL database
 * (`DATABASE_URL`). Users are inserted directly with Prisma and sessions are
 * signed with `JWT_SECRET`, so tests don't trip the login rate limiter.
 */
import { PrismaClient, type GlobalRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export const BASE = process.env.KANBY_TEST_URL || "http://localhost:3005";
export const prisma = new PrismaClient();

const run = Math.random().toString(36).slice(2, 8);
let seq = 0;

export type TestUser = {
  id: string;
  email: string;
  password: string;
  displayName: string;
  cookie: string;
};

export function uniqueEmail(prefix = "user") {
  seq += 1;
  return `${prefix}-${run}-${seq}@test.kanby`;
}

/** A fake client IP so each test file gets its own rate-limit bucket. */
export function fakeIp() {
  return `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
}

export function sessionCookie(user: { id: string; globalRole: GlobalRole }) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET must be set for the API suite");
  const token = jwt.sign({ sub: user.id, role: user.globalRole }, secret, { expiresIn: 3600 });
  return `kanby_session=${token}`;
}

export async function createUser(opts: {
  role?: GlobalRole;
  active?: boolean;
  mustChangePwd?: boolean;
  name?: string;
} = {}): Promise<TestUser> {
  const password = "password-123";
  const email = uniqueEmail(opts.role === "ADMIN" ? "admin" : "user");
  const displayName = opts.name ?? `Test ${seq}`;
  const user = await prisma.user.create({
    data: {
      email,
      displayName,
      passwordHash: await bcrypt.hash(password, 4),
      globalRole: opts.role ?? "USER",
      active: opts.active ?? true,
      mustChangePwd: opts.mustChangePwd ?? false,
    },
  });
  return { id: user.id, email, password, displayName, cookie: sessionCookie(user) };
}

type Opts = {
  method?: string;
  body?: unknown;
  as?: TestUser | null;
  headers?: Record<string, string>;
  raw?: string;
};

export async function api(path: string, opts: Opts = {}) {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.as) headers.cookie = opts.as.cookie;
  if (opts.body !== undefined || opts.raw !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(BASE + path, {
    method: opts.method ?? (opts.body !== undefined || opts.raw !== undefined ? "POST" : "GET"),
    headers,
    body: opts.raw ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    redirect: "manual",
  });
  let json: any = null;
  const text = await res.text();
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json, headers: res.headers };
}

/** Create a board owned by `owner` and return it with its default columns. */
export async function createBoard(owner: TestUser, type: "PERSONAL" | "TEAM" = "PERSONAL", name = "Board") {
  const r = await api("/api/boards", { as: owner, body: { name, type } });
  if (r.status !== 201) throw new Error(`createBoard failed: ${r.status} ${JSON.stringify(r.json)}`);
  const columns = [...r.json.board.columns].sort((a: any, b: any) => a.order - b.order);
  return { board: r.json.board, columns };
}

export async function addMember(owner: TestUser, boardId: string, member: TestUser) {
  const r = await api(`/api/boards/${boardId}/members`, { as: owner, body: { userId: member.id } });
  if (r.status !== 201) throw new Error(`addMember failed: ${r.status} ${JSON.stringify(r.json)}`);
}

export async function createCard(user: TestUser, columnId: string, title = "Card") {
  const r = await api("/api/cards", { as: user, body: { columnId, title } });
  if (r.status !== 201) throw new Error(`createCard failed: ${r.status} ${JSON.stringify(r.json)}`);
  return r.json.card;
}

export async function cardOrder(columnId: string) {
  const cards = await prisma.card.findMany({ where: { columnId }, orderBy: { order: "asc" } });
  return cards.map((c) => c.title);
}
