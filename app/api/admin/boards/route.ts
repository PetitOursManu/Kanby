import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const boards = await prisma.board.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      owner: { select: { id: true, displayName: true, email: true } },
      _count: { select: { cards: true, members: true } },
    },
  });
  return NextResponse.json({ boards });
}