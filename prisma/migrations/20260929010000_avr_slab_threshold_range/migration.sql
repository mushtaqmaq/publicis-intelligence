-- Lets an AVR slab be entered as an explicit range (from - to - rebate %)
-- instead of only a lower bound. RENAME (not drop+recreate) to preserve the
-- 21 real slabs already on file across Elan's 6 categories and Elan Decaux.
-- thresholdTo is nullable — null means open-ended, identical in meaning to
-- every existing slab today, so no existing row's behavior changes.

-- RenameColumn
ALTER TABLE "avr_slabs" RENAME COLUMN "threshold" TO "thresholdFrom";

-- AlterTable
ALTER TABLE "avr_slabs" ADD COLUMN "thresholdTo" DECIMAL(14,2);
