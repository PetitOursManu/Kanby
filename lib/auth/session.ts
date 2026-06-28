import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, DEFAULT_SESSION_TTL_SECONDS } from "@/lib/constants";
import type { GlobalRole, User } from "@prisma/client";
import {
  signSession,
  verifySessionToken,
  type SessionPayload,
} from "@/lib/auth/jwt";

export type { SessionPayload };

function getCookieOptions() {
  const appUrl = process.env.APP_URL || "";
  const secure = appUrl.startsWith("https://");
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: DEFAULT_SESSION_TTL_SECONDS,
  };
}

/** Sign a JWT for the given user and set it as an httpOnly cookie. */
export async function issueSession(user: { id: string; globalRole: GlobalRole }): Promise<void> {
  const payload: SessionPayload = { sub: user.id, role: user.globalRole };
  const token = signSession(payload, DEFAULT_SESSION_TTL_SECONDS);
  const store = cookies();
  store.set(SESSION_COOKIE, token, getCookieOptions());
}

/** Clear the session cookie. */
export function clearSession(): void {
  const store = cookies();
  store.set(SESSION_COOKIE, "", { ...getCookieOptions(), maxAge: 0 });
}

/** Re-export for convenience. */
export { verifySessionToken };

/**
 * Read the session cookie (from `next/headers`) and return the active user,
 * or null if not authenticated / inactive.
 */
export async function getSessionUser(): Promise<User | null> {
  const store = cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = verifySessionToken(token);
  if (!payload) return null;
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.active) return null;
  return user;
}

/**
 * Read the session cookie from a NextRequest (used inside route handlers).
 * Returns the user or null.
 */
export async function getSessionUserFromRequest(req: NextRequest): Promise<User | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = verifySessionToken(token);
  if (!payload) return null;
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.active) return null;
  return user;
}