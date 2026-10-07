-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'PLANNER', 'VIEWER');

-- CreateEnum
CREATE TYPE "MediaCategory" AS ENUM ('STREET_FURNITURE', 'ROADSIDE', 'BILLBOARD', 'MALL', 'TRANSIT', 'AIRPORT', 'SPORTS_VENUE', 'RESIDENTIAL', 'OTHER');

-- CreateEnum
CREATE TYPE "AssetFormat" AS ENUM ('STATIC', 'DIGITAL');

-- CreateEnum
CREATE TYPE "IndoorOutdoor" AS ENUM ('INDOOR', 'OUTDOOR');

-- CreateEnum
CREATE TYPE "SingleDoubleSided" AS ENUM ('SINGLE', 'DOUBLE');

-- CreateEnum
CREATE TYPE "PricingBasis" AS ENUM ('PER_DAY', 'PER_FACE', 'PER_SCREEN', 'PER_SCREEN_BUNDLE', 'PER_POLE', 'PER_CIRCUIT', 'PER_NETWORK', 'PER_WEEK', 'PER_2_WEEKS', 'PER_4_WEEKS', 'PER_3_MONTHS', 'PER_6_MONTHS', 'PER_12_MONTHS', 'FIXED_PACKAGE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "PricingCalculationMethod" AS ENUM ('FIXED', 'PRO_RATA', 'DAILY', 'PER_FACE_DAILY', 'PER_CIRCUIT', 'PER_SCREEN', 'PER_NETWORK', 'MONTHLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "MoneyStatus" AS ENUM ('KNOWN', 'TBD', 'NOT_APPLICABLE', 'ON_REQUEST', 'POA', 'TO_BE_CONFIRMED');

-- CreateEnum
CREATE TYPE "RateCardFileType" AS ENUM ('PDF', 'XLSX', 'XLS', 'CSV');

-- CreateEnum
CREATE TYPE "RateCardStatus" AS ENUM ('UPLOADED', 'PARSING', 'PARSED', 'REVIEW', 'PUBLISHED', 'ARCHIVED', 'FAILED');

-- CreateEnum
CREATE TYPE "ExtractionConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'MANUAL');

-- CreateEnum
CREATE TYPE "RateChangeType" AS ENUM ('NEW', 'CHANGED', 'UNCHANGED', 'CONFLICT', 'LOW_CONFIDENCE', 'REMOVED');

-- CreateEnum
CREATE TYPE "RateDecision" AS ENUM ('PENDING', 'PUBLISHED', 'REJECTED', 'EDITED', 'MERGED_INTO_EXISTING');

-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('AVAILABLE', 'PROPOSED', 'ON_HOLD', 'BOOKED', 'UNAVAILABLE', 'MAINTENANCE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "MediaPlanStatus" AS ENUM ('DRAFT', 'INTERNAL_REVIEW', 'CLIENT_SHARED', 'APPROVED', 'BOOKED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImportSourceType" AS ENUM ('EXCEL_MIGRATION', 'RATE_CARD_UPLOAD', 'MANUAL');

-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReconciliationAction" AS ENUM ('KEEP_EXCEL', 'USE_RATE_CARD', 'MANUAL_VALUE', 'NEEDS_DISCUSSION');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('OPEN', 'RESOLVED', 'IGNORED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legacyNames" TEXT[],
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "website" TEXT,
    "notes" TEXT,
    "defaultDiscountPct" DECIMAL(6,4),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_cards" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_card_versions" (
    "id" TEXT NOT NULL,
    "rateCardId" TEXT NOT NULL,
    "versionLabel" TEXT NOT NULL,
    "rateYear" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "fileType" "RateCardFileType" NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "storageUrl" TEXT NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "status" "RateCardStatus" NOT NULL DEFAULT 'UPLOADED',
    "uploadedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "assetsExtracted" INTEGER NOT NULL DEFAULT 0,
    "warningsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_card_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "assetCode" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "supplierAssetCode" TEXT,
    "assetName" TEXT NOT NULL,
    "mediaCategory" "MediaCategory" NOT NULL DEFAULT 'OTHER',
    "mediaType" TEXT,
    "format" "AssetFormat" NOT NULL,
    "indoorOutdoor" "IndoorOutdoor" NOT NULL DEFAULT 'OUTDOOR',
    "singleDoubleSided" "SingleDoubleSided",
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "locationName" TEXT NOT NULL,
    "area" TEXT,
    "municipality" TEXT,
    "street" TEXT,
    "landmark" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "googleMapsUrl" TEXT,
    "assetUrl" TEXT,
    "supplierUrl" TEXT,
    "numberOfFaces" INTEGER,
    "numberOfScreens" INTEGER,
    "numberOfPoles" INTEGER,
    "numberOfNetworks" INTEGER,
    "numberOfCircuits" INTEGER,
    "facesPerCircuit" INTEGER,
    "screensPerNetwork" INTEGER,
    "physicalWidth" DECIMAL(8,3),
    "physicalHeight" DECIMAL(8,3),
    "physicalUnit" TEXT DEFAULT 'm',
    "screenResolutionWidth" INTEGER,
    "screenResolutionHeight" INTEGER,
    "fileFormat" TEXT,
    "material" TEXT,
    "dpi" INTEGER,
    "slotDurationSeconds" INTEGER,
    "loopDurationSeconds" INTEGER,
    "shareOfVoice" DECIMAL(6,4),
    "illumination" TEXT,
    "installationRequirements" TEXT,
    "productionRequirements" TEXT,
    "startingDayRules" TEXT,
    "minimumDuration" TEXT,
    "bookingConditions" TEXT,
    "notes" TEXT,
    "pricingCalculationMethod" "PricingCalculationMethod" NOT NULL DEFAULT 'PRO_RATA',
    "primaryImageId" TEXT,
    "locationMapImageId" TEXT,
    "technicalSpecDocumentId" TEXT,
    "extraAttributes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_images" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'gallery',
    "caption" TEXT,
    "sourceDocument" TEXT,
    "sourcePage" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_specs" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "sourceDocument" TEXT,
    "sourcePage" INTEGER,

    CONSTRAINT "asset_specs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audience_metrics" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "metricType" TEXT NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,
    "unit" TEXT,
    "demographic" TEXT,
    "sourceDocument" TEXT,
    "sourcePage" INTEGER,
    "rateYear" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audience_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_availabilities" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "AvailabilityStatus" NOT NULL DEFAULT 'UNKNOWN',
    "notes" TEXT,
    "mediaPlanItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_availabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_rates" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "rateCardVersionId" TEXT NOT NULL,
    "rateYear" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'QAR',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "pricingBasis" "PricingBasis" NOT NULL,
    "durationValue" DECIMAL(8,2),
    "durationUnit" TEXT,
    "quantityBasis" TEXT,
    "grossRateStatus" "MoneyStatus" NOT NULL DEFAULT 'KNOWN',
    "grossRate" DECIMAL(14,2),
    "publishedStatus" "RateDecision" NOT NULL DEFAULT 'PENDING',
    "sourcePage" INTEGER,
    "sourceValueRaw" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_fees" (
    "id" TEXT NOT NULL,
    "assetRateId" TEXT NOT NULL,
    "feeType" TEXT NOT NULL,
    "status" "MoneyStatus" NOT NULL DEFAULT 'KNOWN',
    "amount" DECIMAL(14,2),
    "perUnit" TEXT,
    "sourceValueRaw" TEXT,

    CONSTRAINT "asset_fees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_overrides" (
    "id" TEXT NOT NULL,
    "mediaPlanItemId" TEXT NOT NULL,
    "originalRate" DECIMAL(14,2) NOT NULL,
    "newRate" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "defaultDiscountPct" DECIMAL(6,4),
    "defaultAgencyFeePct" DECIMAL(6,4),
    "currency" TEXT NOT NULL DEFAULT 'QAR',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_plans" (
    "id" TEXT NOT NULL,
    "planCode" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "campaignName" TEXT NOT NULL,
    "campaignId" TEXT,
    "brand" TEXT,
    "campaignStart" TIMESTAMP(3) NOT NULL,
    "campaignEnd" TIMESTAMP(3) NOT NULL,
    "budget" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'QAR',
    "objective" TEXT,
    "targetAudience" TEXT,
    "targetLocations" TEXT,
    "notes" TEXT,
    "status" "MediaPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_plan_versions" (
    "id" TEXT NOT NULL,
    "mediaPlanId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_plan_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_plan_items" (
    "id" TEXT NOT NULL,
    "mediaPlanVersionId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "selectedCircuits" INTEGER DEFAULT 1,
    "selectedFaces" INTEGER,
    "rateSnapshot" JSONB NOT NULL,
    "discountPct" DECIMAL(6,4),
    "additionalDiscountPct" DECIMAL(6,4),
    "grossCost" DECIMAL(14,2),
    "netMedia" DECIMAL(14,2),
    "productionFee" DECIMAL(14,2),
    "uploadFee" DECIMAL(14,2),
    "installationFee" DECIMAL(14,2),
    "serviceFee" DECIMAL(14,2),
    "otherFees" DECIMAL(14,2),
    "lineTotal" DECIMAL(14,2),
    "excludesPendingCost" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "media_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" TEXT NOT NULL,
    "sourceType" "ImportSourceType" NOT NULL,
    "rateCardVersionId" TEXT,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'QUEUED',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "triggeredById" TEXT,
    "assetsFound" INTEGER NOT NULL DEFAULT 0,
    "suppliersFound" INTEGER NOT NULL DEFAULT 0,
    "ratesImported" INTEGER NOT NULL DEFAULT 0,
    "feesImported" INTEGER NOT NULL DEFAULT 0,
    "missingRates" INTEGER NOT NULL DEFAULT 0,
    "duplicateAssets" INTEGER NOT NULL DEFAULT 0,
    "invalidValues" INTEGER NOT NULL DEFAULT 0,
    "conflictsFound" INTEGER NOT NULL DEFAULT 0,
    "summary" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_changes" (
    "id" TEXT NOT NULL,
    "importJobId" TEXT NOT NULL,
    "rateCardVersionId" TEXT NOT NULL,
    "assetId" TEXT,
    "candidateAssetName" TEXT NOT NULL,
    "candidateLocation" TEXT,
    "changeType" "RateChangeType" NOT NULL,
    "extractionConfidence" "ExtractionConfidence" NOT NULL DEFAULT 'MEDIUM',
    "oldValue" JSONB,
    "newValue" JSONB,
    "decision" "RateDecision" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliations" (
    "id" TEXT NOT NULL,
    "assetId" TEXT,
    "candidateAssetName" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "excelValue" TEXT,
    "rateCardValue" TEXT,
    "difference" TEXT,
    "sourceDocument" TEXT NOT NULL,
    "sourcePage" INTEGER,
    "rateCardVersionId" TEXT,
    "recommendedAction" "ReconciliationAction" NOT NULL DEFAULT 'NEEDS_DISCUSSION',
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_name_key" ON "suppliers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "rate_card_versions_checksumSha256_key" ON "rate_card_versions"("checksumSha256");

-- CreateIndex
CREATE INDEX "rate_card_versions_rateYear_idx" ON "rate_card_versions"("rateYear");

-- CreateIndex
CREATE UNIQUE INDEX "assets_assetCode_key" ON "assets"("assetCode");

-- CreateIndex
CREATE INDEX "assets_supplierId_idx" ON "assets"("supplierId");

-- CreateIndex
CREATE INDEX "assets_mediaCategory_idx" ON "assets"("mediaCategory");

-- CreateIndex
CREATE INDEX "assets_area_idx" ON "assets"("area");

-- CreateIndex
CREATE INDEX "assets_latitude_longitude_idx" ON "assets"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "asset_images_assetId_idx" ON "asset_images"("assetId");

-- CreateIndex
CREATE INDEX "asset_specs_assetId_idx" ON "asset_specs"("assetId");

-- CreateIndex
CREATE INDEX "audience_metrics_assetId_idx" ON "audience_metrics"("assetId");

-- CreateIndex
CREATE INDEX "asset_availabilities_assetId_startDate_endDate_idx" ON "asset_availabilities"("assetId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "asset_rates_assetId_rateYear_idx" ON "asset_rates"("assetId", "rateYear");

-- CreateIndex
CREATE INDEX "asset_rates_rateCardVersionId_idx" ON "asset_rates"("rateCardVersionId");

-- CreateIndex
CREATE INDEX "asset_fees_assetRateId_idx" ON "asset_fees"("assetRateId");

-- CreateIndex
CREATE UNIQUE INDEX "clients_name_key" ON "clients"("name");

-- CreateIndex
CREATE UNIQUE INDEX "media_plans_planCode_key" ON "media_plans"("planCode");

-- CreateIndex
CREATE UNIQUE INDEX "media_plan_versions_mediaPlanId_versionNumber_key" ON "media_plan_versions"("mediaPlanId", "versionNumber");

-- CreateIndex
CREATE INDEX "media_plan_items_mediaPlanVersionId_idx" ON "media_plan_items"("mediaPlanVersionId");

-- CreateIndex
CREATE INDEX "media_plan_items_assetId_idx" ON "media_plan_items"("assetId");

-- CreateIndex
CREATE INDEX "rate_changes_importJobId_idx" ON "rate_changes"("importJobId");

-- CreateIndex
CREATE INDEX "reconciliations_status_idx" ON "reconciliations"("status");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- AddForeignKey
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_card_versions" ADD CONSTRAINT "rate_card_versions_rateCardId_fkey" FOREIGN KEY ("rateCardId") REFERENCES "rate_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_images" ADD CONSTRAINT "asset_images_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_specs" ADD CONSTRAINT "asset_specs_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audience_metrics" ADD CONSTRAINT "audience_metrics_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_availabilities" ADD CONSTRAINT "asset_availabilities_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_rates" ADD CONSTRAINT "asset_rates_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_rates" ADD CONSTRAINT "asset_rates_rateCardVersionId_fkey" FOREIGN KEY ("rateCardVersionId") REFERENCES "rate_card_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_fees" ADD CONSTRAINT "asset_fees_assetRateId_fkey" FOREIGN KEY ("assetRateId") REFERENCES "asset_rates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_overrides" ADD CONSTRAINT "rate_overrides_mediaPlanItemId_fkey" FOREIGN KEY ("mediaPlanItemId") REFERENCES "media_plan_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_overrides" ADD CONSTRAINT "rate_overrides_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_plans" ADD CONSTRAINT "media_plans_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_plans" ADD CONSTRAINT "media_plans_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_plan_versions" ADD CONSTRAINT "media_plan_versions_mediaPlanId_fkey" FOREIGN KEY ("mediaPlanId") REFERENCES "media_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_plan_versions" ADD CONSTRAINT "media_plan_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_plan_items" ADD CONSTRAINT "media_plan_items_mediaPlanVersionId_fkey" FOREIGN KEY ("mediaPlanVersionId") REFERENCES "media_plan_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_plan_items" ADD CONSTRAINT "media_plan_items_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_rateCardVersionId_fkey" FOREIGN KEY ("rateCardVersionId") REFERENCES "rate_card_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_changes" ADD CONSTRAINT "rate_changes_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "import_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_changes" ADD CONSTRAINT "rate_changes_rateCardVersionId_fkey" FOREIGN KEY ("rateCardVersionId") REFERENCES "rate_card_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_rateCardVersionId_fkey" FOREIGN KEY ("rateCardVersionId") REFERENCES "rate_card_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
