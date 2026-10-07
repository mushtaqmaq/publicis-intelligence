"use server";

import { requireMediaUser } from "@/lib/auth/modules";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { PricingCalculationMethod } from "@/generated/prisma/enums";
import { buildAndCalculateLineItem } from "@/lib/planning/buildLineItem";

import { requirePermission } from "@/lib/auth/permissions";

// Deleting a media plan is irreversible (cascades through every version,
// line item, and proof-of-posting record) and removes real historical
// spend/revenue data from every report and dashboard it fed into — so it's
// restricted to the owner/SUPER_ADMIN account only, not delegable via the
// regular permission system the way campaigns.manage_status etc. are.
export async function deleteMediaPlanAction(formData: FormData) {
  const user = await requireMediaUser();
  if (user.role !== "SUPER_ADMIN") {
    throw new Error("Only the owner (Super Admin) can delete a media plan.");
  }

  const planId = formData.get("planId") as string;
  const plan = await prisma.mediaPlan.delete({
    where: { id: planId },
    select: { planCode: true, campaignName: true, clientId: true },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "MEDIA_PLAN_DELETED",
      entityType: "MediaPlan",
      entityId: planId,
      oldValue: { planCode: plan.planCode, campaignName: plan.campaignName, clientId: plan.clientId },
    },
  });

  revalidatePath("/media/plans");
  revalidatePath("/media/dashboard");
  redirect("/media/plans");
}

async function assertVersionEditable(versionId: string) {
  const version = await prisma.mediaPlanVersion.findUniqueOrThrow({
    where: { id: versionId },
    select: { isLocked: true },
  });
  if (version.isLocked) {
    throw new Error(
      "This plan version is locked (Approved/Booked/Completed plans are never edited after the fact). " +
        "Create a new version to make changes."
    );
  }
}

export async function addAssetToPlanAction(formData: FormData) {
  const user = await requireMediaUser();
  const planId = formData.get("planId") as string;
  const versionId = formData.get("versionId") as string;
  const assetId = formData.get("assetId") as string;
  const assetRateId = formData.get("assetRateId") as string;
  const quantity = Number(formData.get("quantity")) || 1;
  const startDate = new Date(formData.get("startDate") as string);
  const endDate = new Date(formData.get("endDate") as string);
  const discountPct = Number(formData.get("discountPct") || 0) / 100;
  const additionalDiscountPct = Number(formData.get("additionalDiscountPct") || 0) / 100;
  const notes = (formData.get("notes") as string)?.trim() || null;
  const buyingEntityId = (formData.get("buyingEntityId") as string)?.trim() || null;
  const discountOverrideReason = (formData.get("discountOverrideReason") as string)?.trim() || null;

  if (additionalDiscountPct !== 0 && !discountOverrideReason) {
    redirect(
      `/media/plans/${planId}/add-asset/${assetId}?v=${versionId}&error=` +
        encodeURIComponent("A non-zero Additional Discount % requires a reason — it's a manual override, not a standard discount.")
    );
  }

  await assertVersionEditable(versionId);

  const [asset, rate, itemCount] = await Promise.all([
    prisma.asset.findUniqueOrThrow({ where: { id: assetId } }),
    prisma.assetRate.findUniqueOrThrow({
      where: { id: assetRateId },
      include: { fees: true, rateCardVersion: { include: { rateCard: { include: { supplier: true } } } } },
    }),
    prisma.mediaPlanItem.count({ where: { mediaPlanVersionId: versionId } }),
  ]);

  const { result } = buildAndCalculateLineItem({
    calculationMethod: asset.pricingCalculationMethod as PricingCalculationMethod,
    rate: {
      grossRateStatus: rate.grossRateStatus,
      grossRate: rate.grossRate ? Number(rate.grossRate) : null,
      durationValue: rate.durationValue ? Number(rate.durationValue) : null,
      durationUnit: rate.durationUnit,
      fees: rate.fees.map((f) => ({ feeType: f.feeType, status: f.status, amount: f.amount ? Number(f.amount) : null })),
    },
    campaignStart: startDate,
    campaignEnd: endDate,
    quantity,
    discountPct,
    additionalDiscountPct,
  });

  const sourceDocument =
    rate.rateCardVersion.rateCard.supplier.name === "__EXCEL_MIGRATION__"
      ? "Excel migration"
      : rate.rateCardVersion.originalFilename;

  const rateSnapshot = {
    rateId: rate.id,
    rateYear: rate.rateYear,
    sourceRateCard: sourceDocument,
    sourcePage: rate.sourcePage,
    pricingBasis: rate.pricingBasis,
    grossRate: rate.grossRate ? Number(rate.grossRate) : null,
    grossRateStatus: rate.grossRateStatus,
    fees: rate.fees.map((f) => ({ feeType: f.feeType, status: f.status, amount: f.amount ? Number(f.amount) : null })),
    calculationMethod: asset.pricingCalculationMethod,
    quantity,
    capturedAt: new Date().toISOString(),
  };

  const moneyOrNull = (v: { status: string; amount: number | null }) => (v.status === "KNOWN" ? v.amount : null);

  const item = await prisma.mediaPlanItem.create({
    data: {
      mediaPlanVersionId: versionId,
      assetId,
      sortOrder: itemCount,
      startDate,
      endDate,
      selectedCircuits: quantity,
      rateSnapshot: rateSnapshot as unknown as Prisma.InputJsonValue,
      discountPct,
      additionalDiscountPct,
      grossCost: moneyOrNull(result.grossCost),
      netMedia: moneyOrNull(result.netMedia),
      productionFee: moneyOrNull(result.productionFee),
      uploadFee: moneyOrNull(result.uploadFee),
      installationFee: moneyOrNull(result.installationFee),
      serviceFee: moneyOrNull(result.serviceFee),
      otherFees: moneyOrNull(result.otherFees),
      lineTotal: moneyOrNull(result.lineTotal),
      excludesPendingCost: result.excludesPendingCost,
      notes,
      buyingEntityId,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "PLAN_ITEM_ADDED",
      entityType: "MediaPlanItem",
      entityId: item.id,
      newValue: { planId, versionId, assetId, quantity, lineTotal: moneyOrNull(result.lineTotal) },
    },
  });

  if (additionalDiscountPct !== 0) {
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "DISCOUNT_OVERRIDE_APPLIED",
        entityType: "MediaPlanItem",
        entityId: item.id,
        newValue: { planId, assetId, additionalDiscountPct: additionalDiscountPct * 100, reason: discountOverrideReason },
      },
    });
  }

  revalidatePath(`/media/plans/${planId}`);
  redirect(`/media/plans/${planId}`);
}

export async function removeItemAction(formData: FormData) {
  const user = await requireMediaUser();
  const planId = formData.get("planId") as string;
  const itemId = formData.get("itemId") as string;

  const item = await prisma.mediaPlanItem.findUniqueOrThrow({
    where: { id: itemId },
    select: { mediaPlanVersionId: true, assetId: true, lineTotal: true },
  });
  await assertVersionEditable(item.mediaPlanVersionId);

  await prisma.mediaPlanItem.delete({ where: { id: itemId } });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "PLAN_ITEM_REMOVED",
      entityType: "MediaPlanItem",
      entityId: itemId,
      oldValue: { planId, assetId: item.assetId, lineTotal: item.lineTotal ? Number(item.lineTotal) : null },
    },
  });

  revalidatePath(`/media/plans/${planId}`);
  redirect(`/media/plans/${planId}`);
}

// Statuses at which a plan's current version becomes immutable — per the
// project brief, "Historical approved/booked plans must remain unchanged."
const LOCKING_STATUSES = new Set(["APPROVED", "BOOKED", "COMPLETED", "SCHEDULED", "LIVE"]);

export async function updateStatusAction(formData: FormData) {
  const user = await requireMediaUser();
  const planId = formData.get("planId") as string;
  const versionId = formData.get("versionId") as string;
  const newStatus = formData.get("status") as string;

  const plan = await prisma.mediaPlan.findUniqueOrThrow({ where: { id: planId }, select: { status: true } });

  await prisma.$transaction([
    prisma.mediaPlan.update({ where: { id: planId }, data: { status: newStatus as never } }),
    ...(LOCKING_STATUSES.has(newStatus)
      ? [prisma.mediaPlanVersion.update({ where: { id: versionId }, data: { isLocked: true } })]
      : []),
    prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "PLAN_STATUS_CHANGED",
        entityType: "MediaPlan",
        entityId: planId,
        oldValue: { status: plan.status },
        newValue: { status: newStatus },
      },
    }),
  ]);

  revalidatePath(`/media/plans/${planId}`);
  redirect(`/media/plans/${planId}`);
}

// Real workflow tracking (artwork/BO-PO/supplier confirmation) — separate
// from the plan's overall status, so an Account Manager can record "artwork
// submitted" without touching the plan's approval/booking state.
export async function updateWorkflowStatusAction(formData: FormData) {
  const user = await requireMediaUser();
  await requirePermission(user, "campaigns.manage_status");

  const planId = formData.get("planId") as string;
  const artworkStatus = (formData.get("artworkStatus") as string) || null;
  const boPoStatus = (formData.get("boPoStatus") as string) || null;
  const supplierConfirmationStatus = (formData.get("supplierConfirmationStatus") as string) || null;

  const plan = await prisma.mediaPlan.findUniqueOrThrow({
    where: { id: planId },
    select: { artworkStatus: true, boPoStatus: true, supplierConfirmationStatus: true },
  });

  await prisma.mediaPlan.update({
    where: { id: planId },
    data: {
      artworkStatus: artworkStatus as never,
      boPoStatus: boPoStatus as never,
      supplierConfirmationStatus: supplierConfirmationStatus as never,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "PLAN_WORKFLOW_STATUS_CHANGED",
      entityType: "MediaPlan",
      entityId: planId,
      oldValue: plan,
      newValue: { artworkStatus, boPoStatus, supplierConfirmationStatus },
    },
  });

  revalidatePath(`/media/plans/${planId}`);
}

export async function createNewVersionAction(formData: FormData) {
  const user = await requireMediaUser();
  const planId = formData.get("planId") as string;

  const latest = await prisma.mediaPlanVersion.findFirst({
    where: { mediaPlanId: planId },
    orderBy: { versionNumber: "desc" },
    include: { items: true },
  });
  if (!latest) throw new Error("Plan has no existing version to copy from.");

  const nextNumber = latest.versionNumber + 1;
  const newVersion = await prisma.mediaPlanVersion.create({
    data: {
      mediaPlanId: planId,
      versionNumber: nextNumber,
      label: `V${nextNumber}`,
      createdById: user.id,
      ...(latest.onlineData !== null ? { onlineData: latest.onlineData as unknown as Prisma.InputJsonValue } : {}),
      items: {
        create: latest.items.map((item) => ({
          assetId: item.assetId,
          sortOrder: item.sortOrder,
          startDate: item.startDate,
          endDate: item.endDate,
          selectedCircuits: item.selectedCircuits,
          selectedFaces: item.selectedFaces,
          rateSnapshot: item.rateSnapshot as unknown as Prisma.InputJsonValue,
          discountPct: item.discountPct,
          additionalDiscountPct: item.additionalDiscountPct,
          grossCost: item.grossCost,
          netMedia: item.netMedia,
          productionFee: item.productionFee,
          uploadFee: item.uploadFee,
          installationFee: item.installationFee,
          serviceFee: item.serviceFee,
          otherFees: item.otherFees,
          lineTotal: item.lineTotal,
          excludesPendingCost: item.excludesPendingCost,
          notes: item.notes,
        })),
      },
    },
  });

  // A new version starts editable and the plan reverts to Draft — a fresh
  // round of changes shouldn't inherit an Approved/Booked status it hasn't
  // earned yet.
  await prisma.mediaPlan.update({ where: { id: planId }, data: { status: "DRAFT" } });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "PLAN_VERSION_CREATED",
      entityType: "MediaPlan",
      entityId: planId,
      newValue: { versionNumber: nextNumber, copiedFromVersion: latest.versionNumber, itemCount: latest.items.length },
    },
  });

  revalidatePath(`/media/plans/${planId}`);
  redirect(`/media/plans/${planId}?v=${newVersion.id}`);
}
