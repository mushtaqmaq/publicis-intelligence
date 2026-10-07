import { createHash } from "node:crypto";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";

function slug(name: string) {
  return name.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 40);
}

// A manually-typed rate (no source PDF/spreadsheet to upload) still gets a
// real, traceable RateCardVersion — a small receipt recording exactly what
// was entered, by whom, and when — rather than leaving AssetRate.rateCardVersionId
// pointing at an unrelated document or being fabricated.
export async function createManualRateCardVersion(params: {
  supplierId: string;
  supplierName: string;
  assetName: string;
  enteredByEmail: string;
  note: string;
  rateYear: number;
}) {
  const timestamp = new Date();
  const receipt =
    `"Manual rate entry"\n` +
    `"Supplier","${params.supplierName.replace(/"/g, '""')}"\n` +
    `"Asset","${params.assetName.replace(/"/g, '""')}"\n` +
    `"Entered by","${params.enteredByEmail}"\n` +
    `"Entered at","${timestamp.toISOString()}"\n` +
    `"Note","${params.note.replace(/"/g, '""')}"\n`;
  const buffer = Buffer.from(receipt, "utf-8");
  const checksum = createHash("sha256").update(buffer).digest("hex");

  const blob = await put(`rate-cards/manual-${slug(params.supplierName).toLowerCase()}-${Date.now()}.csv`, buffer, {
    access: "private",
    addRandomSuffix: true,
    contentType: "text/csv",
  });

  const rateCard = await prisma.rateCard.create({
    data: { supplierId: params.supplierId, title: `${params.assetName} — manual entry` },
  });

  return prisma.rateCardVersion.create({
    data: {
      rateCardId: rateCard.id,
      versionLabel: "V1",
      rateYear: params.rateYear,
      effectiveFrom: new Date(`${params.rateYear}-01-01`),
      fileType: "CSV",
      originalFilename: `${params.assetName} — manual entry receipt`,
      storageUrl: blob.url,
      checksumSha256: checksum,
      fileSizeBytes: buffer.length,
      status: "PUBLISHED",
      publishedAt: timestamp,
      assetsExtracted: 1,
    },
  });
}
