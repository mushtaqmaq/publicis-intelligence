-- CreateEnum
CREATE TYPE "FinanceDocType" AS ENUM ('QUOTATION', 'BOOKING_ORDER', 'PURCHASE_ORDER', 'INVOICE', 'BILL');

-- CreateTable
CREATE TABLE "finance_documents" (
    "id" TEXT NOT NULL,
    "type" "FinanceDocType" NOT NULL,
    "code" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "clientId" TEXT,
    "supplierId" TEXT,
    "campaignId" TEXT,
    "mediaPlanId" TEXT,
    "mediaPlanVersionId" TEXT,
    "parentId" TEXT,
    "reference" TEXT,
    "issueDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "taxRatePct" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_lines" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "sourceItemId" TEXT,

    CONSTRAINT "finance_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_payments" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "clientId" TEXT,
    "supplierId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "paidOn" TIMESTAMP(3) NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'BANK_TRANSFER',
    "reference" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_allocations" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "finance_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "finance_documents_code_key" ON "finance_documents"("code");

-- CreateIndex
CREATE INDEX "finance_documents_type_status_idx" ON "finance_documents"("type", "status");

-- CreateIndex
CREATE INDEX "finance_documents_clientId_idx" ON "finance_documents"("clientId");

-- CreateIndex
CREATE INDEX "finance_documents_supplierId_idx" ON "finance_documents"("supplierId");

-- CreateIndex
CREATE INDEX "finance_documents_campaignId_idx" ON "finance_documents"("campaignId");

-- CreateIndex
CREATE INDEX "finance_documents_parentId_idx" ON "finance_documents"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "finance_lines_documentId_position_key" ON "finance_lines"("documentId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "finance_payments_code_key" ON "finance_payments"("code");

-- CreateIndex
CREATE INDEX "finance_payments_direction_paidOn_idx" ON "finance_payments"("direction", "paidOn");

-- CreateIndex
CREATE INDEX "finance_allocations_documentId_idx" ON "finance_allocations"("documentId");

-- CreateIndex
CREATE INDEX "finance_allocations_paymentId_idx" ON "finance_allocations"("paymentId");

-- AddForeignKey
ALTER TABLE "finance_documents" ADD CONSTRAINT "finance_documents_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_documents" ADD CONSTRAINT "finance_documents_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_documents" ADD CONSTRAINT "finance_documents_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_documents" ADD CONSTRAINT "finance_documents_mediaPlanId_fkey" FOREIGN KEY ("mediaPlanId") REFERENCES "media_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_documents" ADD CONSTRAINT "finance_documents_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "finance_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_lines" ADD CONSTRAINT "finance_lines_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "finance_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_allocations" ADD CONSTRAINT "finance_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "finance_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_allocations" ADD CONSTRAINT "finance_allocations_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "finance_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Capability permission. Everyone with the Finance module can view and prepare documents; finance.manage
-- decides who may issue invoices, record payments and void documents. Nobody is granted it here; administrators always can.
INSERT INTO "permissions" ("id", "key", "label", "category") VALUES
  ('perm_finance_manage', 'finance.manage', 'Finance: issue invoices, record payments, void documents', 'finance')
ON CONFLICT ("key") DO NOTHING;
