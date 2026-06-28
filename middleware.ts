import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/constants";

// Paths that require an active session. The widget and the auth pages are
// intentionally excluded so a missing cookie never blocks them.
const PROTECTED = [/^\/boards/, /^\/profile/, /^\/admin/];

/**
 * Decode a JWT payload **without verification**. The middleware is only a
 * UX gate: the real session verification happens server-side in
// `getSessionUser` (which uses jsonwebtoken + the JWT_SECRET). Decoding here
// without verifying only decides whether to redirect to /login — a forged
// token could bypass the redirect but would still be rejected by every
// server-side route handler. This keeps jsonwebtoken out of the edge bundle.
 */
function decodePayload(token: string): { sub?: string; role?: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const payload = token ? decodePayload(token) : null;

  const isProtected = PROTECTED.some((re) => re.test(pathname));
  if (!isProtected) return NextResponse.next();

  if (!payload?.sub) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/admin") && payload.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/boards", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/boards/:path*", "/profile/:path*", "/admin/:path*"],
};