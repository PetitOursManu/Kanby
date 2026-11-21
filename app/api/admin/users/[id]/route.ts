import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { deleteUserAsAdmin } from "@/lib/admin/service";

export const runtime = "nodejs";

/** Delete a user and everything they own (boards, comments, tokens). */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const result = await deleteUserAsAdmin(auth.user.id, params.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
