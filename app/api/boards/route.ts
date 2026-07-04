import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-guard";
import { getTranslator, parseLocale, LOCALE_COOKIE } from "@/lib/i18n";

export const runtime = "nodejs";

/** Boards visible to the user: owned + member-of. */
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
      where: { userId },
      include: {
        board: {
          include: { _count: { select: { cards: true } } },
        },
      },
      orderBy: { board: { updatedAt: "desc" } },
    }),
  ]);

  const memberBoards = memberOf.map((m) => ({ ...m.board, membership: m.role }));

  return NextResponse.json({
    owned: owned.map((b) => ({ ...b, role: "OWNER" as const })),
    member: memberBoards.map((b) => ({ ...b, role: b.membership })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  let body: { name?: string; type?: "PERSONAL" | "TEAM" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "Nom requis" }, { status: 400 });
  const type = body.type === "TEAM" ? "TEAM" : "PERSONAL";

  const locale = parseLocale(req.cookies.get(LOCALE_COOKIE)?.value);
  const t = getTranslator(locale);

  const board = await prisma.board.create({
    data: {
      name,
      type,
      ownerId: auth.user.id,
      members: type === "TEAM"
        ? { create: { userId: auth.user.id, role: "OWNER" } }
        : undefined,
      columns: {
        create: [
          { name: t("board.defaultColTodo"), kind: "TODO", order: 0 },
          { name: t("board.defaultColDoing"), kind: "DOING", order: 1 },
          { name: t("board.defaultColDone"), kind: "DONE", order: 2 },
        ],
      },
    },
    include: { columns: true },
  });

  return NextResponse.json({ board }, { status: 201 });
}