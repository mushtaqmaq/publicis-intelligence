-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('OOH', 'RADIO', 'TV', 'PRINT', 'CINEMA', 'SMS', 'DIGITAL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PricingBasis" ADD VALUE 'PER_SPOT';
ALTER TYPE "PricingBasis" ADD VALUE 'PER_INSERTION';
ALTER TYPE "PricingBasis" ADD VALUE 'PER_MESSAGE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PricingCalculationMethod" ADD VALUE 'PER_SPOT';
ALTER TYPE "PricingCalculationMethod" ADD VALUE 'PER_INSERTION';
ALTER TYPE "PricingCalculationMethod" ADD VALUE 'PER_MESSAGE';

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "mediaType" "MediaType" NOT NULL DEFAULT 'OOH';
