-- CreateEnum
CREATE TYPE "MultimediaStatus" AS ENUM ('PLANNED', 'SCHEDULED', 'IN_PROGRESS', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'DELIVERED', 'CANCELLED');

-- CreateTable
CREATE TABLE "multimedia_jobs" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "jobType" TEXT NOT NULL DEFAULT 'VIDEO_SHOOT',
    "brief" TEXT NOT NULL,
    "status" "MultimediaStatus" NOT NULL DEFAULT 'PLANNED',
    "clientId" TEXT NOT NULL,
    "campaignId" TEXT,
    "deliverableId" TEXT,
    "creativeRequestId" TEXT,
    "requestedById" TEXT NOT NULL,
    "producerId" TEXT,
    "reviewerId" TEXT,
    "location" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "deliveryNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "multimedia_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "multimedia_tasks" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "assigneeId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "multimedia_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resources" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'CREW',
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_bookings" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resource_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "multimedia_versions" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "submittedById" TEXT NOT NULL,
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "multimedia_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "multimedia_jobs_code_key" ON "multimedia_jobs"("code");

-- CreateIndex
CREATE INDEX "multimedia_jobs_status_idx" ON "multimedia_jobs"("status");

-- CreateIndex
CREATE INDEX "multimedia_jobs_producerId_idx" ON "multimedia_jobs"("producerId");

-- CreateIndex
CREATE INDEX "multimedia_jobs_clientId_idx" ON "multimedia_jobs"("clientId");

-- CreateIndex
CREATE INDEX "multimedia_jobs_campaignId_idx" ON "multimedia_jobs"("campaignId");

-- CreateIndex
CREATE INDEX "multimedia_tasks_jobId_idx" ON "multimedia_tasks"("jobId");

-- CreateIndex
CREATE INDEX "multimedia_tasks_assigneeId_idx" ON "multimedia_tasks"("assigneeId");

-- CreateIndex
CREATE UNIQUE INDEX "resources_name_key" ON "resources"("name");

-- CreateIndex
CREATE INDEX "resource_bookings_resourceId_startsAt_idx" ON "resource_bookings"("resourceId", "startsAt");

-- CreateIndex
CREATE INDEX "resource_bookings_jobId_idx" ON "resource_bookings"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "multimedia_versions_jobId_versionNo_key" ON "multimedia_versions"("jobId", "versionNo");

-- AddForeignKey
ALTER TABLE "multimedia_jobs" ADD CONSTRAINT "multimedia_jobs_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "multimedia_jobs" ADD CONSTRAINT "multimedia_jobs_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "multimedia_jobs" ADD CONSTRAINT "multimedia_jobs_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "deliverables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "multimedia_jobs" ADD CONSTRAINT "multimedia_jobs_creativeRequestId_fkey" FOREIGN KEY ("creativeRequestId") REFERENCES "creative_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "multimedia_tasks" ADD CONSTRAINT "multimedia_tasks_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "multimedia_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_bookings" ADD CONSTRAINT "resource_bookings_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_bookings" ADD CONSTRAINT "resource_bookings_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "multimedia_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "multimedia_versions" ADD CONSTRAINT "multimedia_versions_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "multimedia_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Capability permission: schedule, assign and manage any Multimedia job and manage resources.
-- Not granted to anyone here; administrators always can, others get it through a per-user override.
INSERT INTO "permissions" ("id", "key", "label", "category") VALUES
  ('perm_multimedia_manage', 'multimedia.manage', 'Multimedia: schedule and manage jobs and resources', 'multimedia')
ON CONFLICT ("key") DO NOTHING;
