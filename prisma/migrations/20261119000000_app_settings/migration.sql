-- Instance settings edited from the admin page (single row, id = 1).
CREATE TABLE IF NOT EXISTS "AppSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "allowRegistration" BOOLEAN,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);
