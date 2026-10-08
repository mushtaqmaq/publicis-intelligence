-- CreateEnum
CREATE TYPE "CreativeStatus" AS ENUM ('NEW', 'ASSIGNED', 'IN_PROGRESS', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'DELIVERED', 'CANCELLED');

-- CreateTable
CREATE TABLE "creative_requests" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'DESIGN',
    "brief" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" "CreativeStatus" NOT NULL DEFAULT 'NEW',
    "clientId" TEXT NOT NULL,
    "campaignId" TEXT,
    "deliverableId" TEXT,
    "requestedById" TEXT NOT NULL,
    "assigneeId" TEXT,
    "reviewerId" TEXT,
    "dueDate" TIMESTAMP(3),
    "assignedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "deliveryNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creative_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creative_versions" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "submittedById" TEXT NOT NULL,
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "creative_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "creative_requests_code_key" ON "creative_requests"("code");

-- CreateIndex
CREATE INDEX "creative_requests_status_idx" ON "creative_requests"("status");

-- CreateIndex
CREATE INDEX "creative_requests_assigneeId_idx" ON "creative_requests"("assigneeId");

-- CreateIndex
CREATE INDEX "creative_requests_clientId_idx" ON "creative_requests"("clientId");

-- CreateIndex
CREATE INDEX "creative_requests_campaignId_idx" ON "creative_requests"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "creative_versions_requestId_versionNo_key" ON "creative_versions"("requestId", "versionNo");

-- AddForeignKey
ALTER TABLE "creative_requests" ADD CONSTRAINT "creative_requests_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creative_requests" ADD CONSTRAINT "creative_requests_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creative_requests" ADD CONSTRAINT "creative_requests_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "deliverables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creative_versions" ADD CONSTRAINT "creative_versions_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "creative_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Capability permission: assign designers/reviewers and manage any Creative request. Nobody is granted it here;
-- administrators always can, and others get it through a per-user override.
INSERT INTO "permissions" ("id", "key", "label", "category") VALUES
  ('perm_creative_manage', 'creative.manage', 'Creative: assign and manage requests', 'creative')
ON CONFLICT ("key") DO NOTHING;
