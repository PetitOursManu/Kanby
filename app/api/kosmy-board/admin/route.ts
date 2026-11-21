import { handleBoardAdmin } from "@/lib/kosmy-board/admin";
import { boardAdminDeps } from "@/lib/kosmy-board/admin-deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/kosmy-board/admin — summary of the admin shown in Kosmy Board
 * (protocol kosmy.board-admin.v1). Called by the Board's server with a
 * single-use Bearer JWT, never by a browser: no session cookie, no CORS.
 */
export async function GET(req: Request) {
  return handleBoardAdmin(req, null, boardAdminDeps);
}

/** Only GET exists here; answered in JSON like every other error of the protocol. */
export async function POST(req: Request) {
  return handleBoardAdmin(req, null, boardAdminDeps);
}
