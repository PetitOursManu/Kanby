-- History of date changes in a calendar: tasks transferred to another day,
-- day / week boards moved, due dates changed.

DO $$ BEGIN
  CREATE TYPE "DateChangeKind" AS ENUM ('CARD_MOVED', 'BOARD_MOVED', 'DUE_DATE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "DateChange" (
    "id" TEXT NOT NULL,
    "rootBoardId" TEXT NOT NULL,
    "kind" "DateChangeKind" NOT NULL,
    "period" "BoardPeriod",
    "cardId" TEXT,
    "fromBoardId" TEXT,
    "toBoardId" TEXT,
    "title" TEXT NOT NULL,
    "fromDate" DATE,
    "toDate" DATE,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DateChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DateChange_rootBoardId_createdAt_idx" ON "DateChange"("rootBoardId", "createdAt");
CREATE INDEX IF NOT EXISTS "DateChange_cardId_createdAt_idx" ON "DateChange"("cardId", "createdAt");
CREATE INDEX IF NOT EXISTS "DateChange_fromBoardId_idx" ON "DateChange"("fromBoardId");
CREATE INDEX IF NOT EXISTS "DateChange_toBoardId_idx" ON "DateChange"("toBoardId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DateChange_rootBoardId_fkey') THEN
    ALTER TABLE "DateChange" ADD CONSTRAINT "DateChange_rootBoardId_fkey"
      FOREIGN KEY ("rootBoardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DateChange_cardId_fkey') THEN
    ALTER TABLE "DateChange" ADD CONSTRAINT "DateChange_cardId_fkey"
      FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DateChange_actorId_fkey') THEN
    ALTER TABLE "DateChange" ADD CONSTRAINT "DateChange_actorId_fkey"
      FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
