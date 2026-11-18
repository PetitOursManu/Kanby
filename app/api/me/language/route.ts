import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-guard";
import { LOCALE_COOKIE, LOCALES } from "@/lib/i18n";
import { badRequest, readJson } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * POST /api/me/language — body { locale: "fr" | "en" }.
 * Saved in a cookie (read by server components) and on the user (so
 * notifications reach them in their language).
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const body = await readJson<{ locale: string }>(req);
  const locale = body?.locale;
  if (!locale || !LOCALES.includes(locale as never)) return badRequest("Locale invalide");

  await prisma.user.update({ where: { id: auth.user.id }, data: { locale } });

  const res = NextResponse.json({ ok: true, locale });
  res.cookies.set(LOCALE_COOKIE, locale, {
    httpOnly: false,
    sameSite: "lax",
    secure: (process.env.APP_URL || "").startsWith("https://"),
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
