-- CreateTable
CREATE TABLE "asset_package_components" (
    "id" TEXT NOT NULL,
    "packageAssetId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "quantity" INTEGER,
    "sizeRaw" TEXT,
    "imageUrl" TEXT,
    "linkedAssetId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_package_components_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_package_components_packageAssetId_idx" ON "asset_package_components"("packageAssetId");

-- AddForeignKey
ALTER TABLE "asset_package_components" ADD CONSTRAINT "asset_package_components_packageAssetId_fkey" FOREIGN KEY ("packageAssetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_package_components" ADD CONSTRAINT "asset_package_components_linkedAssetId_fkey" FOREIGN KEY ("linkedAssetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
