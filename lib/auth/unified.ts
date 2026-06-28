import { NextRequest } from "next/server";
import type { User } from "@prisma/client";
import { resolveApiTokenUser } from "@/lib/auth/token";
import { getSessionUserFromRequest } from "@/lib/auth/session";

/**
 * Resolve the authenticated user from a NextRequest, accepting either:
 *   1. Authorization: Bearer kbt_...  (API token — mobile / external clients)
 *   2. kanby_session cookie          (JWT session — web app)
 *
 * Bearer token takes precedence: if the Authorization header is present,
 * the session cookie is never checked. This prevents identity confusion
 * (a Bearer token for user A with a cookie for user B must never resolve
 * to user B). If the Bearer token is invalid, the request gets 401 even
 * if a valid cookie exists.
 */
export async function resolveUserFromRequest(req: NextRequest): Promise<User | null> {
  const authHeader = req.headers.get("authorization") || "";
  if (authHeader.startsWith("Bearer ")) {
    const rawToken = authHeader.slice("Bearer ".length).trim();
    return resolveApiTokenUser(rawToken);
  }
  return getSessionUserFromRequest(req);
}