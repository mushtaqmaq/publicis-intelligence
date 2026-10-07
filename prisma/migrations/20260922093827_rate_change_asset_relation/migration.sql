-- AddForeignKey
ALTER TABLE "rate_changes" ADD CONSTRAINT "rate_changes_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
