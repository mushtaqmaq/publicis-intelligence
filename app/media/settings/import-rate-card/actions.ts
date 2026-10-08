"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { uploadAndProcessRateCard } from "@/lib/ingestion/orchestrate";
import { requireMediaUser } from "@/lib/auth/modules";

function detectFileType(filename: string): "PDF" | "XLSX" | "XLS" | "CSV" | null {
  const ext = filename.toLowerCase().split(".").pop();
  switch (ext) {
    case "pdf":
      return "PDF";
    case "xlsx":
      return "XLSX";
    case "xls":
      return "XLS";
    case "csv":
      return "CSV";
    default:
      return null;
  }
}

export async function uploadRateCardAction(formData: FormData) {
  const user = await requireMediaUser("settings");
  const file = formData.get("file") as File | null;
  const supplierId = formData.get("supplierId") as string;
  const rateYearRaw = formData.get("rateYear") as string;
  const versionLabel = (formData.get("versionLabel") as string) || "V1";
  const effectiveFromRaw = formData.get("effectiveFrom") as string;
  const rateCardTitle = (formData.get("rateCardTitle") as string) || file?.name || "Untitled rate card";

  if (!file || file.size === 0) {
    redirect("/media/settings/import-rate-card?error=" + encodeURIComponent("No file was selected."));
  }
  if (!supplierId) {
    redirect("/media/settings/import-rate-card?error=" + encodeURIComponent("A supplier must be selected."));
  }

  const fileType = detectFileType(file.name);
  if (!fileType) {
    redirect(
      "/media/settings/import-rate-card?error=" +
        encodeURIComponent(`Unsupported file type for "${file.name}". Supported: PDF, XLSX, XLS, CSV.`)
    );
  }

  const rateYear = Number(rateYearRaw);
  if (!Number.isFinite(rateYear) || rateYear < 2000 || rateYear > 2100) {
    redirect("/media/settings/import-rate-card?error=" + encodeURIComponent("Rate year must be a valid year."));
  }

  const effectiveFrom = effectiveFromRaw ? new Date(effectiveFromRaw) : new Date(Date.UTC(rateYear, 0, 1));
  const buffer = Buffer.from(await file.arrayBuffer());

  let result;
  try {
    result = await uploadAndProcessRateCard({
      fileBuffer: buffer,
      originalFilename: file.name,
      fileType: fileType!,
      supplierId,
      rateCardTitle,
      rateYear,
      versionLabel,
      effectiveFrom,
      uploadedById: user.id,
    });
  } catch (err) {
    redirect(
      "/media/settings/import-rate-card?error=" +
        encodeURIComponent(`Failed to process "${file.name}": ${err instanceof Error ? err.message : String(err)}`)
    );
  }

  if (result.status === "duplicate") {
    redirect(
      "/media/settings/import-rate-card?error=" +
        encodeURIComponent(
          `This exact file was already imported on ${result.uploadedAt.toLocaleDateString()}. Nothing was re-processed.`
        )
    );
  }

  redirect(`/media/settings/rate-cards/${result.rateCardVersionId}/review`);
}

export async function getSuppliersForUpload() {
  return prisma.supplier.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}
