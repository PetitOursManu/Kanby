import { handleBoardUsers } from "@/lib/kosmy-board/users";
import { boardUsersDeps } from "@/lib/kosmy-board/users-deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { params: { sub: string } };

/** PUT /api/kosmy-board/users/{sub} — create, link or update the account of the Board person `sub`. */
export async function PUT(req: Request, { params }: Params) {
  return handleBoardUsers(req, params.sub, boardUsersDeps);
}

/** DELETE /api/kosmy-board/users/{sub} — deactivate that account (its data stays). */
export async function DELETE(req: Request, { params }: Params) {
  return handleBoardUsers(req, params.sub, boardUsersDeps);
}

/** Other methods: answered in JSON (405) like every other error of the protocol. */
export async function GET(req: Request, { params }: Params) {
  return handleBoardUsers(req, params.sub, boardUsersDeps);
}
export const POST = GET;
