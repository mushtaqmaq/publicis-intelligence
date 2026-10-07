-- AlterTable
ALTER TABLE "users" ADD COLUMN     "credits" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ledger" (
    "id" BIGSERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "ts" BIGINT NOT NULL,
    "kind" TEXT NOT NULL,
    "model" TEXT,
    "route" TEXT,
    "input_tokens" INTEGER DEFAULT 0,
    "output_tokens" INTEGER DEFAULT 0,
    "searches" INTEGER DEFAULT 0,
    "usd" DOUBLE PRECISION DEFAULT 0,
    "credits" DOUBLE PRECISION NOT NULL,
    "balance_after" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "by_user" TEXT,

    CONSTRAINT "ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "docs" (
    "col" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "owner" TEXT,
    "data" TEXT NOT NULL,
    "updated_at" BIGINT NOT NULL,

    CONSTRAINT "docs_pkey" PRIMARY KEY ("col","id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "model" TEXT,
    "messages" TEXT NOT NULL DEFAULT '[]',
    "updated_at" BIGINT NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "files" (
    "id" TEXT NOT NULL,
    "owner" TEXT,
    "name" TEXT,
    "mime" TEXT,
    "size" INTEGER,
    "kind" TEXT,
    "created_at" BIGINT,
    "data" BYTEA NOT NULL,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_fails" (
    "k" TEXT NOT NULL,
    "n" INTEGER NOT NULL,
    "t" BIGINT NOT NULL,

    CONSTRAINT "login_fails_pkey" PRIMARY KEY ("k")
);

-- CreateIndex
CREATE INDEX "ledger_user_ts" ON "ledger"("user_id", "ts");

-- CreateIndex
CREATE INDEX "conv_user" ON "conversations"("user_id", "updated_at");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
