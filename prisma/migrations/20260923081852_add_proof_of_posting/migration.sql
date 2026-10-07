-- CreateTable
CREATE TABLE "proof_of_postings" (
    "id" TEXT NOT NULL,
    "mediaPlanItemId" TEXT NOT NULL,
    "photoUrl" TEXT NOT NULL,
    "postedDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proof_of_postings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "proof_of_postings_mediaPlanItemId_idx" ON "proof_of_postings"("mediaPlanItemId");

-- AddForeignKey
ALTER TABLE "proof_of_postings" ADD CONSTRAINT "proof_of_postings_mediaPlanItemId_fkey" FOREIGN KEY ("mediaPlanItemId") REFERENCES "media_plan_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proof_of_postings" ADD CONSTRAINT "proof_of_postings_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
