-- Per-user restrictions set by an administrator (Kosmy Board users, kosmy.board-users.v1).
-- Only applied to regular users (USER), never to administrators.

-- Most boards the user may own (null = no limit, 0 = cannot create boards).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "maxBoards" INTEGER;
-- May use API tokens (mobile API, widget).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "canUseApi" BOOLEAN NOT NULL DEFAULT true;
