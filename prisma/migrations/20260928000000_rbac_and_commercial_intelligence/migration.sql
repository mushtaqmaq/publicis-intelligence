-- RBAC (roles, permissions, per-user overrides), Client->Account Manager
-- assignment, campaign-workflow status fields, and real commercial-data
-- entry tables (revenue targets, supplier AVR schemes). Fully additive —
-- no existing column, row, or enum value is altered or removed.

-- CreateEnum
CREATE TYPE "ArtworkStatus" AS ENUM ('NOT_SUBMITTED', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "BoPoStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'ISSUED');

-- CreateEnum
CREATE TYPE "SupplierConfirmationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DECLINED');

-- AlterEnum
ALTER TYPE "MediaPlanStatus" ADD VALUE 'PLANNING';
ALTER TYPE "MediaPlanStatus" ADD VALUE 'AWAITING_ARTWORK';
ALTER TYPE "MediaPlanStatus" ADD VALUE 'SCHEDULED';
ALTER TYPE "MediaPlanStatus" ADD VALUE 'LIVE';

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'SUPER_ADMIN';
ALTER TYPE "UserRole" ADD VALUE 'ACCOUNT_MANAGER';

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "accountManagerId" TEXT;

-- AlterTable
ALTER TABLE "media_plans" ADD COLUMN     "artworkStatus" "ArtworkStatus",
ADD COLUMN     "boPoStatus" "BoPoStatus",
ADD COLUMN     "supplierConfirmationStatus" "SupplierConfirmationStatus";

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_permission_overrides" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_permission_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revenue_targets" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "targetAmount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'QAR',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "revenue_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avr_schemes" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "avr_schemes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avr_slabs" (
    "id" TEXT NOT NULL,
    "avrSchemeId" TEXT NOT NULL,
    "threshold" DECIMAL(14,2) NOT NULL,
    "rebatePct" DECIMAL(6,4) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "avr_slabs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_permissionId_key" ON "role_permissions"("role", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "user_permission_overrides_userId_permissionId_key" ON "user_permission_overrides"("userId", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "revenue_targets_year_key" ON "revenue_targets"("year");

-- CreateIndex
CREATE UNIQUE INDEX "avr_schemes_supplierId_key" ON "avr_schemes"("supplierId");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_accountManagerId_fkey" FOREIGN KEY ("accountManagerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avr_schemes" ADD CONSTRAINT "avr_schemes_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avr_slabs" ADD CONSTRAINT "avr_slabs_avrSchemeId_fkey" FOREIGN KEY ("avrSchemeId") REFERENCES "avr_schemes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
