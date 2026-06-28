import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const [users, boards, activeTasks, completedTasks] = await Promise.all([
    prisma.user.count(),
    prisma.board.count(),
    prisma.card.count({ where: { completedAt: null } }),
    prisma.card.count({ where: { completedAt: { not: null } } }),
  ]);

  return NextResponse.json({
    users,
    boards,
    activeTasks,
    completedTasks,
  });
}