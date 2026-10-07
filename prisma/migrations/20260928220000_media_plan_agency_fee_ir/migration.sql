-- Real agency commercial fields captured per line item: agencyFeeAmount is
-- the client-facing management/campaign fee, irAmount is the incentive
-- rebate the agency earns from the supplier (never billed to the client).
-- "Net to Media" and "Net to Client" already exist as netMedia/lineTotal —
-- no new columns needed for those. Additive, nullable, no data migration.

-- AlterTable
ALTER TABLE "media_plan_items" ADD COLUMN     "agencyFeeAmount" DECIMAL(14,2),
ADD COLUMN     "irAmount" DECIMAL(14,2);
