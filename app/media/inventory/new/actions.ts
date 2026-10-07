"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/auth/session";
import { createManualRateCardVersion } from "@/lib/ingestion/manualRateCard";
import type { AssetFormat } from "@/generated/prisma/enums";

function toIntOrNull(v: FormDataEntryValue | null): number | null {
  if (!v || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function createAssetAction(formData: FormData) {
  const user = await requireSessionUser();

  const supplierId = formData.get("supplierId") as string;
  const assetName = (formData.get("assetName") as string)?.trim();
  const mediaType = (formData.get("mediaType") as string)?.trim() || null;
  const mediaCategoryId = formData.get("mediaCategoryId") as string;
  const format = ((formData.get("format") as string) || null) as AssetFormat | null;
  const locationName = (formData.get("locationName") as string)?.trim();
  const notes = (formData.get("notes") as string)?.trim() || null;

  if (!supplierId || !assetName || !locationName) {
    redirect(`/media/inventory/new?error=${encodeURIComponent("Supplier, asset name, and location are required.")}`);
  }

  const supplier = await prisma.supplier.findUniqueOrThrow({ where: { id: supplierId } });

  const pricingCalculationMethod = formData.get("pricingCalculationMethod") as string;
  const pricingBasis = formData.get("pricingBasis") as string;
  const grossRateStatus = formData.get("grossRateStatus") as string;
  const grossRateRaw = formData.get("grossRate") as string;
  const currency = ((formData.get("currency") as string) || "QAR").trim();
  const quantityBasis = (formData.get("quantityBasis") as string)?.trim() || null;
  const durationValue = toIntOrNull(formData.get("durationValue"));
  const durationUnit = (formData.get("durationUnit") as string)?.trim() || null;
  const rateYear = Number(formData.get("rateYear")) || new Date().getFullYear();
  const sourceNote = (formData.get("sourceNote") as string)?.trim() || "Manually entered.";

  const asset = await prisma.asset.create({
    data: {
      assetCode: `${supplier.mediaChannel}-${supplier.name.toUpperCase().replace(/[^A-Z0-9]+/g, "")}-${Date.now()}`,
      supplierId,
      assetName,
      mediaCategoryId,
      mediaType,
      format,
      indoorOutdoor: "OUTDOOR",
      locationName,
      notes,
      pricingCalculationMethod: pricingCalculationMethod as never,
    },
  });

  if (grossRateStatus === "KNOWN" && grossRateRaw) {
    const rateCardVersion = await createManualRateCardVersion({
      supplierId,
      supplierName: supplier.name,
      assetName,
      enteredByEmail: user.email,
      note: sourceNote,
      rateYear,
    });

    await prisma.assetRate.create({
      data: {
        assetId: asset.id,
        supplierId,
        rateCardVersionId: rateCardVersion.id,
        rateYear,
        currency,
        effectiveFrom: new Date(`${rateYear}-01-01`),
        pricingBasis: pricingBasis as never,
        durationValue,
        durationUnit,
        quantityBasis,
        grossRateStatus: "KNOWN",
        grossRate: Number(grossRateRaw),
        publishedStatus: "PUBLISHED",
        sourceValueRaw: sourceNote,
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "ASSET_CREATED",
      entityType: "Asset",
      entityId: asset.id,
      newValue: { assetName, supplier: supplier.name },
    },
  });

  redirect(`/media/inventory/${asset.id}`);
}
