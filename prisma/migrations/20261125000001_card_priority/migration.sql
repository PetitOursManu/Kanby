-- Importance of a task: 0 = none, 1 = low, 2 = medium, 3 = high, 4 = urgent.
ALTER TABLE "Card" ADD COLUMN IF NOT EXISTS "priority" INTEGER NOT NULL DEFAULT 0;
