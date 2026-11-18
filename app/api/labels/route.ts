import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBoardMember } from "@/lib/auth-guard";
import { LABEL_COLORS } from "@/lib/constants";
import { LIMITS, badRequest, readJson, text } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await readJson<{ boardId: string; name: string; color: string }>(req);
  if (!body) return badRequest("Requête invalide");
  const name = text(body.name, LIMITS.labelName, { required: true });
  if (typeof body.boardId !== "string" || name.error) {
    return badRequest(name.error === "too_long" ? "Nom trop long" : "boardId et name requis");
  }
  const color = typeof body.color === "string" ? body.color.trim() : "";
  if (!LABEL_COLORS.some((c) => c.value === color)) return badRequest("Couleur invalide");

  const auth = await requireBoardMember(req, body.boardId);
  if ("error" in auth) return auth.error;

  const label = await prisma.label.create({ data: { boardId: body.boardId, name: name.value!, color } });
  return NextResponse.json({ label }, { status: 201 });
}
