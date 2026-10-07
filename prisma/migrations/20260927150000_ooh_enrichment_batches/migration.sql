-- Persists rows from an external asset spreadsheet that carry real data
-- (coordinates, audience metrics, pricing) but didn't confidently match an
-- existing asset, so they are reviewed instead of guessed or dropped.
CREATE TABLE "ooh_enrichment_batches" (
    "id" TEXT NOT NULL,
    "sourceLabel" TEXT NOT NULL,
    "pending" JSONB NOT NULL,
    "resolved" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ooh_enrichment_batches_pkey" PRIMARY KEY ("id")
);
