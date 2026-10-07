"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import type { AssetFormat } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { requireSessionUser } from "@/lib/auth/session";
import { createManualRateCardVersion } from "@/lib/ingestion/manualRateCard";

interface AuditableChange {
  field: string;
  old: unknown;
  new: unknown;
}

async function logAssetEdit(assetId: string, changes: AuditableChange[], userId: string) {
  if (changes.length === 0) return;
  await prisma.auditLog.create({
    data: {
      userId,
      action: "ASSET_EDITED",
      entityType: "Asset",
      entityId: assetId,
      oldValue: Object.fromEntries(changes.map((c) => [c.field, c.old])) as unknown as Prisma.InputJsonValue,
      newValue: Object.fromEntries(changes.map((c) => [c.field, c.new])) as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function updateAssetAction(formData: FormData) {
  const user = await requireSessionUser();
  const assetId = formData.get("assetId") as string;
  const current = await prisma.asset.findUniqueOrThrow({ where: { id: assetId } });

  const next = {
    assetName: (formData.get("assetName") as string)?.trim(),
    locationName: (formData.get("locationName") as string)?.trim(),
    area: (formData.get("area") as string)?.trim() || null,
    format: ((formData.get("format") as string) || null) as AssetFormat | null,
    mediaType: (formData.get("mediaType") as string)?.trim() || null,
    mediaCategoryId: formData.get("mediaCategoryId") as string,
    numberOfFaces: toIntOrNull(formData.get("numberOfFaces")),
    numberOfScreens: toIntOrNull(formData.get("numberOfScreens")),
    numberOfCircuits: toIntOrNull(formData.get("numberOfCircuits")),
    numberOfPoles: toIntOrNull(formData.get("numberOfPoles")),
    notes: (formData.get("notes") as string)?.trim() || null,
  };

  const changes: AuditableChange[] = [];
  for (const key of Object.keys(next) as Array<keyof typeof next>) {
    const oldVal = (current as unknown as Record<string, unknown>)[key];
    const newVal = next[key];
    const oldComparable = oldVal instanceof Object && "toString" in oldVal ? oldVal.toString() : oldVal;
    if (oldComparable !== newVal && !(oldComparable === null && newVal === null)) {
      changes.push({ field: key, old: oldVal ?? null, new: newVal ?? null });
    }
  }

  await prisma.asset.update({ where: { id: assetId }, data: next });
  await logAssetEdit(assetId, changes, user.id);

  // --- Package components: replace-all, simplest correct approach given
  // this is a small, infrequently-edited list, not a high-churn dataset.
  const componentsRaw = formData.get("packageComponents") as string | null;
  if (componentsRaw !== null) {
    let parsed: Array<{ label: string; quantity: string; sizeRaw: string; linkedAssetId: string }> = [];
    try {
      parsed = JSON.parse(componentsRaw);
    } catch {
      parsed = [];
    }
    const clean = parsed.filter((c) => c.label && c.label.trim() !== "");

    await prisma.$transaction([
      prisma.assetPackageComponent.deleteMany({ where: { packageAssetId: assetId } }),
      ...clean.map((c, index) =>
        prisma.assetPackageComponent.create({
          data: {
            packageAssetId: assetId,
            label: c.label.trim(),
            quantity: c.quantity ? Number(c.quantity) : null,
            sizeRaw: c.sizeRaw?.trim() || null,
            linkedAssetId: c.linkedAssetId || null,
            sortOrder: index,
          },
        })
      ),
    ]);

    if (clean.length > 0) {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: "ASSET_PACKAGE_COMPONENTS_EDITED",
          entityType: "Asset",
          entityId: assetId,
          newValue: { componentCount: clean.length },
        },
      });
    }
  }

  revalidatePath(`/planning/inventory/${assetId}`);
  redirect(`/planning/inventory/${assetId}`);
}

function toIntOrNull(v: FormDataEntryValue | null): number | null {
  if (!v || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function uploadAssetImageAction(formData: FormData) {
  await requireSessionUser();
  const assetId = formData.get("assetId") as string;
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    redirect(`/planning/inventory/${assetId}/edit?error=${encodeURIComponent("No file selected.")}`);
  }

  const buffer = Buffer.from(await file!.arrayBuffer());
  const ext = file!.name.split(".").pop() || "jpg";
  const blob = await put(`asset-images/${assetId}-${Date.now()}.${ext}`, buffer, {
    access: "private",
    addRandomSuffix: true,
  });

  const existingCount = await prisma.assetImage.count({ where: { assetId } });
  await prisma.assetImage.create({
    data: {
      assetId,
      url: blob.url,
      kind: existingCount === 0 ? "primary" : "gallery",
      sourceDocument: "manual upload",
    },
  });

  revalidatePath(`/planning/inventory/${assetId}/edit`);
  revalidatePath(`/planning/inventory/${assetId}`);
  redirect(`/planning/inventory/${assetId}/edit`);
}

export async function setPrimaryImageAction(formData: FormData) {
  await requireSessionUser();
  const assetId = formData.get("assetId") as string;
  const imageId = formData.get("imageId") as string;

  await prisma.$transaction([
    prisma.assetImage.updateMany({ where: { assetId }, data: { kind: "gallery" } }),
    prisma.assetImage.update({ where: { id: imageId }, data: { kind: "primary" } }),
  ]);

  revalidatePath(`/planning/inventory/${assetId}/edit`);
  revalidatePath(`/planning/inventory/${assetId}`);
  redirect(`/planning/inventory/${assetId}/edit`);
}

export async function deleteAssetImageAction(formData: FormData) {
  await requireSessionUser();
  const assetId = formData.get("assetId") as string;
  const imageId = formData.get("imageId") as string;
  await prisma.assetImage.delete({ where: { id: imageId } });
  revalidatePath(`/planning/inventory/${assetId}/edit`);
  revalidatePath(`/planning/inventory/${assetId}`);
  redirect(`/planning/inventory/${assetId}/edit`);
}

export async function addAssetRateAction(formData: FormData) {
  const user = await requireSessionUser();
  const assetId = formData.get("assetId") as string;
  const asset = await prisma.asset.findUniqueOrThrow({ where: { id: assetId }, include: { supplier: true } });

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

  if (pricingCalculationMethod && pricingCalculationMethod !== asset.pricingCalculationMethod) {
    await prisma.asset.update({ where: { id: assetId }, data: { pricingCalculationMethod: pricingCalculationMethod as never } });
  }

  const rateCardVersion = await createManualRateCardVersion({
    supplierId: asset.supplierId,
    supplierName: asset.supplier.name,
    assetName: asset.assetName,
    enteredByEmail: user.email,
    note: sourceNote,
    rateYear,
  });

  await prisma.assetRate.create({
    data: {
      assetId,
      supplierId: asset.supplierId,
      rateCardVersionId: rateCardVersion.id,
      rateYear,
      currency,
      effectiveFrom: new Date(`${rateYear}-01-01`),
      pricingBasis: pricingBasis as never,
      durationValue,
      durationUnit,
      quantityBasis,
      grossRateStatus: grossRateStatus as never,
      grossRate: grossRateStatus === "KNOWN" && grossRateRaw ? Number(grossRateRaw) : null,
      publishedStatus: "PUBLISHED",
      sourceValueRaw: sourceNote,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "ASSET_RATE_ADDED",
      entityType: "Asset",
      entityId: assetId,
      newValue: { rateYear, grossRate: grossRateRaw ?? null, pricingBasis },
    },
  });

  revalidatePath(`/planning/inventory/${assetId}/edit`);
  revalidatePath(`/planning/inventory/${assetId}`);
  redirect(`/planning/inventory/${assetId}/edit`);
}

export async function updateAssetRateAction(formData: FormData) {
  const user = await requireSessionUser();
  const assetId = formData.get("assetId") as string;
  const rateId = formData.get("rateId") as string;
  const grossRateStatus = formData.get("grossRateStatus") as string;
  const grossRateRaw = formData.get("grossRate") as string;
  const currency = ((formData.get("currency") as string) || "QAR").trim();

  const current = await prisma.assetRate.findUniqueOrThrow({ where: { id: rateId } });
  await prisma.assetRate.update({
    where: { id: rateId },
    data: {
      grossRateStatus: grossRateStatus as never,
      grossRate: grossRateStatus === "KNOWN" && grossRateRaw ? Number(grossRateRaw) : null,
      currency,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "ASSET_RATE_EDITED",
      entityType: "AssetRate",
      entityId: rateId,
      oldValue: { grossRate: current.grossRate?.toString() ?? null, grossRateStatus: current.grossRateStatus },
      newValue: { grossRate: grossRateRaw || null, grossRateStatus },
    },
  });

  revalidatePath(`/planning/inventory/${assetId}/edit`);
  revalidatePath(`/planning/inventory/${assetId}`);
  redirect(`/planning/inventory/${assetId}/edit`);
}

export async function deleteAssetRateAction(formData: FormData) {
  const user = await requireSessionUser();
  const assetId = formData.get("assetId") as string;
  const rateId = formData.get("rateId") as string;

  await prisma.assetFee.deleteMany({ where: { assetRateId: rateId } });
  await prisma.assetRate.delete({ where: { id: rateId } });

  await prisma.auditLog.create({
    data: { userId: user.id, action: "ASSET_RATE_DELETED", entityType: "AssetRate", entityId: rateId },
  });

  revalidatePath(`/planning/inventory/${assetId}/edit`);
  revalidatePath(`/planning/inventory/${assetId}`);
  redirect(`/planning/inventory/${assetId}/edit`);
}
