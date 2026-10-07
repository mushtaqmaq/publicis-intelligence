-- AlterTable
ALTER TABLE "media_plan_versions" ADD COLUMN     "onlineData" JSONB;

-- AlterTable
ALTER TABLE "media_plans" ADD COLUMN     "planType" TEXT NOT NULL DEFAULT 'OFFLINE';
