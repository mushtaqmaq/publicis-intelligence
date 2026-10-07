-- AlterTable
ALTER TABLE "media_plan_items" ADD COLUMN     "buyingEntityId" TEXT;

-- CreateIndex
CREATE INDEX "media_plan_items_buyingEntityId_idx" ON "media_plan_items"("buyingEntityId");

-- AddForeignKey
ALTER TABLE "media_plan_items" ADD CONSTRAINT "media_plan_items_buyingEntityId_fkey" FOREIGN KEY ("buyingEntityId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
