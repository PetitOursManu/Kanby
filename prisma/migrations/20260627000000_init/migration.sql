-- Kanby initial migration
-- Hand-written to match prisma/schema.prisma so that `prisma migrate deploy`
-- works on a fresh database without requiring a local dev database.

-- Enums
DO $$ BEGIN
    CREATE TYPE "GlobalRole" AS ENUM ('USER', 'ADMIN');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "BoardType" AS ENUM ('PERSONAL', 'TEAM');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "BoardRole" AS ENUM ('OWNER', 'MEMBER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "ColumnKind" AS ENUM ('TODO', 'DOING', 'DONE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Tables
CREATE TABLE "User" (
    "id"            TEXT NOT NULL,
    "email"         TEXT NOT NULL,
    "displayName"   TEXT NOT NULL,
    "passwordHash"  TEXT NOT NULL,
    "avatarUrl"     TEXT,
    "globalRole"    "GlobalRole" NOT NULL DEFAULT 'USER',
    "mustChangePwd" BOOLEAN NOT NULL DEFAULT false,
    "active"        BOOLEAN NOT NULL DEFAULT true,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_globalRole_idx" ON "User"("globalRole");

CREATE TABLE "ApiToken" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "label"      TEXT NOT NULL,
    "tokenHash"  TEXT NOT NULL,
    "prefix"     TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt"  TIMESTAMP(3),
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApiToken_tokenHash_key" ON "ApiToken"("tokenHash");
CREATE INDEX "ApiToken_tokenHash_idx" ON "ApiToken"("tokenHash");
CREATE INDEX "ApiToken_userId_idx" ON "ApiToken"("userId");

CREATE TABLE "Board" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "type"      "BoardType" NOT NULL,
    "ownerId"   TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Board_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Board_ownerId_idx" ON "Board"("ownerId");
CREATE INDEX "Board_type_idx" ON "Board"("type");

CREATE TABLE "BoardMember" (
    "id"       TEXT NOT NULL,
    "boardId"  TEXT NOT NULL,
    "userId"   TEXT NOT NULL,
    "role"     "BoardRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BoardMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BoardMember_boardId_userId_key" ON "BoardMember"("boardId", "userId");
CREATE INDEX "BoardMember_userId_idx" ON "BoardMember"("userId");

CREATE TABLE "Column" (
    "id"      TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "name"    TEXT NOT NULL,
    "kind"    "ColumnKind" NOT NULL DEFAULT 'TODO',
    "order"   INTEGER NOT NULL,
    CONSTRAINT "Column_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Column_boardId_order_idx" ON "Column"("boardId", "order");

CREATE TABLE "Card" (
    "id"          TEXT NOT NULL,
    "columnId"    TEXT NOT NULL,
    "boardId"     TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "description" TEXT,
    "dueDate"     TIMESTAMP(3),
    "order"       INTEGER NOT NULL,
    "assigneeId"  TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Card_boardId_idx" ON "Card"("boardId");
CREATE INDEX "Card_columnId_order_idx" ON "Card"("columnId", "order");
CREATE INDEX "Card_dueDate_idx" ON "Card"("dueDate");
CREATE INDEX "Card_assigneeId_idx" ON "Card"("assigneeId");

CREATE TABLE "Label" (
    "id"      TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "name"    TEXT NOT NULL,
    "color"   TEXT NOT NULL,
    CONSTRAINT "Label_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Label_boardId_idx" ON "Label"("boardId");

CREATE TABLE "CardLabel" (
    "cardId"  TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    CONSTRAINT "CardLabel_pkey" PRIMARY KEY ("cardId", "labelId")
);

CREATE TABLE "ChecklistItem" (
    "id"     TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "text"   TEXT NOT NULL,
    "done"   BOOLEAN NOT NULL DEFAULT false,
    "order"  INTEGER NOT NULL,
    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChecklistItem_cardId_order_idx" ON "ChecklistItem"("cardId", "order");

CREATE TABLE "Comment" (
    "id"        TEXT NOT NULL,
    "cardId"    TEXT NOT NULL,
    "authorId"  TEXT NOT NULL,
    "text"      TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Comment_cardId_createdAt_idx" ON "Comment"("cardId", "createdAt");

-- Foreign keys
ALTER TABLE "ApiToken"
    ADD CONSTRAINT "ApiToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;

ALTER TABLE "Board"
    ADD CONSTRAINT "Board_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE;

ALTER TABLE "BoardMember"
    ADD CONSTRAINT "BoardMember_boardId_fkey"
    FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE;

ALTER TABLE "BoardMember"
    ADD CONSTRAINT "BoardMember_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;

ALTER TABLE "Column"
    ADD CONSTRAINT "Column_boardId_fkey"
    FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE;

ALTER TABLE "Card"
    ADD CONSTRAINT "Card_columnId_fkey"
    FOREIGN KEY ("columnId") REFERENCES "Column"("id") ON DELETE CASCADE;

ALTER TABLE "Card"
    ADD CONSTRAINT "Card_boardId_fkey"
    FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE;

ALTER TABLE "Card"
    ADD CONSTRAINT "Card_assigneeId_fkey"
    FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL;

ALTER TABLE "Label"
    ADD CONSTRAINT "Label_boardId_fkey"
    FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE;

ALTER TABLE "CardLabel"
    ADD CONSTRAINT "CardLabel_cardId_fkey"
    FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE;

ALTER TABLE "CardLabel"
    ADD CONSTRAINT "CardLabel_labelId_fkey"
    FOREIGN KEY ("labelId") REFERENCES "Label"("id") ON DELETE CASCADE;

ALTER TABLE "ChecklistItem"
    ADD CONSTRAINT "ChecklistItem_cardId_fkey"
    FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE;

ALTER TABLE "Comment"
    ADD CONSTRAINT "Comment_cardId_fkey"
    FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE;

ALTER TABLE "Comment"
    ADD CONSTRAINT "Comment_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE;