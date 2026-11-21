import { handleBoardAdmin } from "@/lib/kosmy-board/admin";
import { boardAdminDeps } from "@/lib/kosmy-board/admin-deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { params: { section: string } };

/** GET /api/kosmy-board/admin/{section} — one section of the admin shown in Kosmy Board. */
export async function GET(req: Request, { params }: Params) {
  return handleBoardAdmin(req, params.section, boardAdminDeps);
}

/** POST /api/kosmy-board/admin/{section} — an action in that section ({ action, row?, values? }). */
export async function POST(req: Request, { params }: Params) {
  return handleBoardAdmin(req, params.section, boardAdminDeps);
}
