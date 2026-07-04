import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-guard";
import { LOCALE_COOKIE, LOCALES } from "@/lib/i18n";

export const runtime = "nodejs";

/**
 * POST /api/me/language
 * Set the interface locale. The locale is stored in a long-lived cookie so
 * it persists across sessions and is readable by server components.
 *
 * Body: { locale: "fr" | "en" }
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  let body: { locale?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const locale = body.locale;
  if (!locale || !LOCALES.includes(locale as never)) {
    return NextResponse.json({ error: "Locale invalide" }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true, locale });
  res.cookies.set(LOCALE_COOKIE, locale, {
    httpOnly: false,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}