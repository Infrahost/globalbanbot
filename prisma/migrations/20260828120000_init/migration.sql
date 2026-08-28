-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('ADMIN', 'MOD');

-- CreateEnum
CREATE TYPE "BanActionStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "Guild" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "isConnectedToNetwork" BOOLEAN NOT NULL DEFAULT false,
    "logChannelId" TEXT,
    "modCanExecuteBan" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Guild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalBan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bannedBy" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalBan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Staff" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BanAction" (
    "id" TEXT NOT NULL,
    "globalBanId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "status" "BanActionStatus" NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BanAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Guild_isConnectedToNetwork_idx" ON "Guild"("isConnectedToNetwork");

-- CreateIndex
CREATE UNIQUE INDEX "GlobalBan_userId_key" ON "GlobalBan"("userId");

-- CreateIndex
CREATE INDEX "GlobalBan_isActive_idx" ON "GlobalBan"("isActive");

-- CreateIndex
CREATE INDEX "Staff_guildId_idx" ON "Staff"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "Staff_userId_guildId_key" ON "Staff"("userId", "guildId");

-- CreateIndex
CREATE INDEX "BanAction_globalBanId_idx" ON "BanAction"("globalBanId");

-- CreateIndex
CREATE INDEX "BanAction_guildId_idx" ON "BanAction"("guildId");

-- CreateIndex
CREATE INDEX "BanAction_status_idx" ON "BanAction"("status");

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BanAction" ADD CONSTRAINT "BanAction_globalBanId_fkey" FOREIGN KEY ("globalBanId") REFERENCES "GlobalBan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BanAction" ADD CONSTRAINT "BanAction_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
