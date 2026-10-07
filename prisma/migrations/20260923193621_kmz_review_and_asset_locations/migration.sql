-- A network/multi-circuit asset (e.g. Elan "MUPIS" covering hundreds of
-- physical panels citywide, one KMZ placemark each) needs many points, not
-- one — Asset.latitude/longitude alone can't hold that.
CREATE TABLE "asset_locations" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_locations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "asset_locations_assetId_idx" ON "asset_locations"("assetId");

ALTER TABLE "asset_locations" ADD CONSTRAINT "asset_locations_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Persists every KMZ placemark the automatic matcher could not confidently
-- resolve, so it is reviewed and assigned rather than silently dropped.
CREATE TABLE "kmz_import_batches" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "supplierId" TEXT,
    "uploadedById" TEXT,
    "pending" JSONB NOT NULL,
    "resolved" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kmz_import_batches_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "kmz_import_batches" ADD CONSTRAINT "kmz_import_batches_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "kmz_import_batches" ADD CONSTRAINT "kmz_import_batches_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
