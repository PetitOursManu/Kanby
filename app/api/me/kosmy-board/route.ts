import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-guard";
import { verifyPassword } from "@/lib/auth/passwords";

export const runtime = "nodejs";

/**
 * DELETE /api/me/kosmy-board — unlink the Kosmy Board account.
 * Body: { password }. Asking for the Kanby password makes sure the user can
 * still sign in afterwards (accounts created by Kosmy Board have no usable password).
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  if (!(await verifyPassword(body.password ?? "", auth.user.passwordHash))) {
    return NextResponse.json({ error: "wrong_password" }, { status: 400 });
  }

  await prisma.user.update({ where: { id: auth.user.id }, data: { kosmySub: null } });
  return NextResponse.json({ ok: true });
}
