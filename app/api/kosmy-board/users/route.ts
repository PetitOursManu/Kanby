import { handleBoardUsers } from "@/lib/kosmy-board/users";
import { boardUsersDeps } from "@/lib/kosmy-board/users-deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/kosmy-board/users — Kanby's roles and restrictions, and the accounts
 * linked to Kosmy Board (protocol kosmy.board-users.v1). Called by the Board's
 * server with a single-use Bearer JWT, never by a browser: no session cookie, no CORS.
 */
export async function GET(req: Request) {
  return handleBoardUsers(req, null, boardUsersDeps);
}

/** Only GET exists here; answered in JSON like every other error of the protocol. */
export async function POST(req: Request) {
  return handleBoardUsers(req, null, boardUsersDeps);
}
export const PUT = POST;
export const DELETE = POST;
