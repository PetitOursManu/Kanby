import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { registrationAllowed, registrationAllowedByEnv, setRegistrationAllowed } from "@/lib/registration";
import { badRequest, readJson } from "@/lib/validation";

export const runtime = "nodejs";

async function current() {
  return { allowRegistration: await registrationAllowed(), envDefault: registrationAllowedByEnv() };
}

/** GET /api/admin/settings — instance settings. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  return NextResponse.json({ settings: await current() });
}

/** PATCH /api/admin/settings — body { allowRegistration: boolean }. */
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const body = await readJson<{ allowRegistration: boolean }>(req);
  if (!body || typeof body.allowRegistration !== "boolean") return badRequest("allowRegistration requis");

  await setRegistrationAllowed(body.allowRegistration);
  return NextResponse.json({ settings: await current() });
}
