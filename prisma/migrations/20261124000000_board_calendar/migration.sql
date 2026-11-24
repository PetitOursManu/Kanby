-- Calendar: a board can hold one board per day and per week.
-- Child boards point to their parent board and are deleted with it.

DO $$ BEGIN
  CREATE TYPE "BoardPeriod" AS ENUM ('DAY', 'WEEK');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Board" ADD COLUMN IF NOT EXISTS "parentId" TEXT;
ALTER TABLE "Board" ADD COLUMN IF NOT EXISTS "period" "BoardPeriod";
ALTER TABLE "Board" ADD COLUMN IF NOT EXISTS "periodStart" DATE;

DO $$ BEGIN
  ALTER TABLE "Board" ADD CONSTRAINT "Board_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- One board per day / per week within a calendar.
CREATE UNIQUE INDEX IF NOT EXISTS "Board_parentId_period_periodStart_key" ON "Board"("parentId", "period", "periodStart");
