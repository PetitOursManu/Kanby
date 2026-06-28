import { NextRequest } from "next/server";
import { resolveApiTokenUser } from "@/lib/auth/token";
import type { User } from "@prisma/client";

/**
 * Resolve the widget caller's identity from either an `Authorization: Bearer`
 * header or a `?token=` query parameter (the latter is used by the iframe
 * `/widget/view` page). Returns the user or null.
 */
export async function resolveWidgetUser(req: NextRequest): Promise<User | null> {
  const authHeader = req.headers.get("authorization") || "";
  const bearer = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  const queryToken = req.nextUrl.searchParams.get("token");
  return resolveApiTokenUser(bearer || queryToken);
}