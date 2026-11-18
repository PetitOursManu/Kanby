import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-guard";
import { getTranslator, parseLocale, LOCALE_COOKIE } from "@/lib/i18n";
import { LIMITS, badRequest, readJson, text } from "@/lib/validation";

export const runtime = "nodejs";

/** Boards visible to the user: owned + member-of (owned boards are never repeated in `member`). */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  const userId = auth.user.id;

  const [owned, memberOf] = await Promise.all([
    prisma.board.findMany({
      where: { ownerId: userId },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { cards: true } } },
    }),
    prisma.boardMember.findMany({
      where: { userId, board: { ownerId: { not: userId } } },
      include: { board: { include: { _count: { select: { cards: true } } } } },
      orderBy: { board: { updatedAt: "desc" } },
    }),
  ]);

  return NextResponse.json({
    owned: owned.map((b) => ({ ...b, role: "OWNER" as const })),
    member: memberOf.map((m) => ({ ...m.board, role: m.role })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const body = await readJson<{ name: string; type: "PERSONAL" | "TEAM" }>(req);
  if (!body) return badRequest("Requête invalide");
  const name = text(body.name, LIMITS.boardName, { required: true });
  if (name.error) return badRequest(name.error === "too_long" ? "Nom trop long" : "Nom requis");
  const type = body.type === "TEAM" ? "TEAM" : "PERSONAL";

  const t = getTranslator(parseLocale(req.cookies.get(LOCALE_COOKIE)?.value));

  const board = await prisma.board.create({
    data: {
      name: name.value!,
      type,
      ownerId: auth.user.id,
      members: type === "TEAM" ? { create: { userId: auth.user.id, role: "OWNER" } } : undefined,
      columns: {
        create: [
          { name: t("board.defaultColTodo"), kind: "TODO", order: 0 },
          { name: t("board.defaultColDoing"), kind: "DOING", order: 1 },
          { name: t("board.defaultColDone"), kind: "DONE", order: 2 },
        ],
      },
    },
    include: { columns: { orderBy: { order: "asc" } } },
  });

  return NextResponse.json({ board }, { status: 201 });
}
