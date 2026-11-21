import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { createUserAsAdmin, listAdminUsers, updateUserAsAdmin } from "@/lib/admin/service";
import { badRequest, readJson } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const users = await listAdminUsers();
  return NextResponse.json({ users });
}

/** Create a new user. Body: { email, displayName, password, globalRole? }. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const body = await readJson<{ email: string; displayName: string; password: string; globalRole: "USER" | "ADMIN" }>(req);
  if (!body) return badRequest("Requête invalide");

  const result = await createUserAsAdmin(body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ user: result.value }, { status: 201 });
}

/**
 * Update a user. Body: { userId, active?, globalRole?, password? }.
 *  - active: enable / disable the account (never yourself)
 *  - globalRole: "USER" | "ADMIN" (you can't demote yourself)
 *  - password: set a temporary password; the user must change it at next login
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const body = await readJson<{ userId: string; active: boolean; globalRole: "USER" | "ADMIN"; password: string }>(req);
  if (!body) return badRequest("userId requis");

  const result = await updateUserAsAdmin(auth.user.id, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ user: result.value });
}
