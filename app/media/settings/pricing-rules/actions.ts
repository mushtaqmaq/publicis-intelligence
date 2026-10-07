"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMediaUser } from "@/lib/auth/modules";
import type { PricingCalculationMethod } from "@/generated/prisma/enums";

export async function updateAssetPricingMethodAction(formData: FormData) {
  const user = await requireMediaUser();
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    throw new Error("Only Admins can change pricing rules.");
  }

  const assetId = formData.get("assetId") as string;
  const pricingCalculationMethod = formData.get("pricingCalculationMethod") as PricingCalculationMethod;
  const returnTo = (formData.get("returnTo") as string) || "/media/settings/pricing-rules";

  const current = await prisma.asset.findUniqueOrThrow({ where: { id: assetId } });
  if (current.pricingCalculationMethod === pricingCalculationMethod) return;

  await prisma.asset.update({ where: { id: assetId }, data: { pricingCalculationMethod } });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "ASSET_PRICING_METHOD_CHANGED",
      entityType: "Asset",
      entityId: assetId,
      oldValue: { pricingCalculationMethod: current.pricingCalculationMethod },
      newValue: { pricingCalculationMethod },
    },
  });

  revalidatePath(returnTo);
}

export async function updateSupplierDefaultDiscountAction(formData: FormData) {
  const user = await requireMediaUser();
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    throw new Error("Only Admins can change default discount rules.");
  }

  const supplierId = formData.get("supplierId") as string;
  const raw = formData.get("defaultDiscountPct") as string;
  const defaultDiscountPct = raw.trim() === "" ? null : Number(raw) / 100;

  const current = await prisma.supplier.findUniqueOrThrow({ where: { id: supplierId } });
  await prisma.supplier.update({ where: { id: supplierId }, data: { defaultDiscountPct } });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "SUPPLIER_DEFAULT_DISCOUNT_CHANGED",
      entityType: "Supplier",
      entityId: supplierId,
      oldValue: { defaultDiscountPct: current.defaultDiscountPct },
      newValue: { defaultDiscountPct },
    },
  });

  revalidatePath("/media/settings/pricing-rules");
}
