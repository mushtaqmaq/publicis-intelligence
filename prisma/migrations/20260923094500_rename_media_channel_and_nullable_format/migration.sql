-- Rename MediaType -> MediaChannel (the earlier name collided in meaning
-- with the pre-existing, unrelated Asset.mediaType free-text column).
ALTER TYPE "MediaType" RENAME TO "MediaChannel";
ALTER TABLE "suppliers" RENAME COLUMN "mediaType" TO "mediaChannel";

-- AssetFormat (static vs digital sign) is an OOH-only concept; a non-OOH
-- asset (radio spot, print insertion, etc.) has no honest value for it.
ALTER TABLE "assets" ALTER COLUMN "format" DROP NOT NULL;
