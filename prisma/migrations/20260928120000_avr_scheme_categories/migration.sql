-- A real supplier AVR file splits one supplier into several commercial
-- categories (e.g. Elan's "Doha OOH" / "Greater Doha OOH" / "DOOH" / "Cinema"
-- each carry their own slab table) — a supplier is not one scheme. Safe:
-- no AvrScheme rows exist yet.

-- DropIndex
DROP INDEX "avr_schemes_supplierId_key";

-- AlterTable
ALTER TABLE "avr_schemes" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'General';

-- CreateIndex
CREATE UNIQUE INDEX "avr_schemes_supplierId_category_year_key" ON "avr_schemes"("supplierId", "category", "year");
