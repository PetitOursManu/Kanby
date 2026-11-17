-- "Se connecter avec Kosmy Board" (OpenID Connect).

-- Kosmy Board account linked to a Kanby user (OpenID Connect `sub`).
ALTER TABLE "User" ADD COLUMN "kosmySub" TEXT;
CREATE UNIQUE INDEX "User_kosmySub_key" ON "User"("kosmySub");

-- Single-row settings table, edited from the admin page.
CREATE TABLE "KosmyBoardSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "issuer" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT NOT NULL,
    "autoCreate" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KosmyBoardSettings_pkey" PRIMARY KEY ("id")
);
