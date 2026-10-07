-- Real, recurring retainer invoices logged per client per month, as they
-- actually happen. Used together with real Agency Fee + IR (already on
-- MediaPlanItem) to compute the agency's actual revenue — never the gross
-- client billing total. Additive, no data migration needed.

-- CreateTable
CREATE TABLE "retainer_fees" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'QAR',
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retainer_fees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "retainer_fees_clientId_year_month_key" ON "retainer_fees"("clientId", "year", "month");

-- AddForeignKey
ALTER TABLE "retainer_fees" ADD CONSTRAINT "retainer_fees_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
