-- MediaCategory was a fixed enum; Settings > Asset Categories now needs to
-- let an Admin add/rename/retire categories, so it becomes a real table.

CREATE TABLE "asset_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "asset_categories_name_key" ON "asset_categories"("name");

-- Seed one row per existing enum value, in the same order they were
-- declared, so sortOrder matches the old dropdown order.
INSERT INTO "asset_categories" ("id", "name", "sortOrder", "updatedAt") VALUES
    ('cat_street_furniture', 'Street Furniture', 0, CURRENT_TIMESTAMP),
    ('cat_roadside', 'Roadside', 1, CURRENT_TIMESTAMP),
    ('cat_billboard', 'Billboard', 2, CURRENT_TIMESTAMP),
    ('cat_mall', 'Mall', 3, CURRENT_TIMESTAMP),
    ('cat_transit', 'Transit', 4, CURRENT_TIMESTAMP),
    ('cat_airport', 'Airport', 5, CURRENT_TIMESTAMP),
    ('cat_sports_venue', 'Sports Venue', 6, CURRENT_TIMESTAMP),
    ('cat_residential', 'Residential', 7, CURRENT_TIMESTAMP),
    ('cat_other', 'Other', 8, CURRENT_TIMESTAMP);

ALTER TABLE "assets" ADD COLUMN "mediaCategoryId" TEXT;

UPDATE "assets" SET "mediaCategoryId" = CASE "mediaCategory"
    WHEN 'STREET_FURNITURE' THEN 'cat_street_furniture'
    WHEN 'ROADSIDE' THEN 'cat_roadside'
    WHEN 'BILLBOARD' THEN 'cat_billboard'
    WHEN 'MALL' THEN 'cat_mall'
    WHEN 'TRANSIT' THEN 'cat_transit'
    WHEN 'AIRPORT' THEN 'cat_airport'
    WHEN 'SPORTS_VENUE' THEN 'cat_sports_venue'
    WHEN 'RESIDENTIAL' THEN 'cat_residential'
    WHEN 'OTHER' THEN 'cat_other'
END;

ALTER TABLE "assets" ALTER COLUMN "mediaCategoryId" SET NOT NULL;

DROP INDEX "assets_mediaCategory_idx";
CREATE INDEX "assets_mediaCategoryId_idx" ON "assets"("mediaCategoryId");

ALTER TABLE "assets" DROP COLUMN "mediaCategory";
DROP TYPE "MediaCategory";

ALTER TABLE "assets" ADD CONSTRAINT "assets_mediaCategoryId_fkey" FOREIGN KEY ("mediaCategoryId") REFERENCES "asset_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
