"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMediaUser } from "@/lib/auth/modules";
import { requirePermission } from "@/lib/auth/permissions";

export async function upsertRevenueTargetAction(formData: FormData) {
  const user = await requireMediaUser();
  await requirePermission(user, "dashboard.revenue.view");

  const year = Number(formData.get("year"));
  const targetAmount = Number(formData.get("targetAmount"));
  const currency = ((formData.get("currency") as string) || "QAR").trim();

  if (!Number.isFinite(year) || !Number.isFinite(targetAmount) || targetAmount <= 0) {
    return;
  }

  const existing = await prisma.revenueTarget.findUnique({ where: { year } });
  await prisma.revenueTarget.upsert({
    where: { year },
    update: { targetAmount, currency },
    create: { year, targetAmount, currency, createdById: user.id },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: existing ? "REVENUE_TARGET_UPDATED" : "REVENUE_TARGET_CREATED",
      entityType: "RevenueTarget",
      entityId: String(year),
      oldValue: existing ? { targetAmount: existing.targetAmount.toString() } : undefined,
      newValue: { year, targetAmount, currency },
    },
  });

  revalidatePath("/media/settings/revenue-targets");
  revalidatePath("/media/dashboard");
}

export async function deleteRevenueTargetAction(formData: FormData) {
  const user = await requireMediaUser();
  await requirePermission(user, "dashboard.revenue.view");

  const id = formData.get("id") as string;
  const target = await prisma.revenueTarget.delete({ where: { id } });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "REVENUE_TARGET_DELETED",
      entityType: "RevenueTarget",
      entityId: id,
      oldValue: { year: target.year, targetAmount: target.targetAmount.toString() },
    },
  });

  revalidatePath("/media/settings/revenue-targets");
  revalidatePath("/media/dashboard");
}
