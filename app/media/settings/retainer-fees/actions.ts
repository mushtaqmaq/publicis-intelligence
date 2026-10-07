"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireMediaUser } from "@/lib/auth/modules";
import { requirePermission } from "@/lib/auth/permissions";

export async function upsertRetainerFeeAction(formData: FormData) {
  const user = await requireMediaUser();
  await requirePermission(user, "dashboard.revenue.view");

  const clientId = formData.get("clientId") as string;
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  const amount = Number(formData.get("amount"));
  const currency = (formData.get("currency") as string) === "USD" ? "USD" : "QAR";
  const notes = (formData.get("notes") as string)?.trim() || null;

  if (!clientId || !Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12 || !Number.isFinite(amount) || amount <= 0) {
    redirect("/media/settings/retainer-fees?error=" + encodeURIComponent("Client, year, month, and a positive amount are required."));
  }

  const existing = await prisma.retainerFee.findUnique({ where: { clientId_year_month: { clientId, year, month } } });
  await prisma.retainerFee.upsert({
    where: { clientId_year_month: { clientId, year, month } },
    update: { amount, currency, notes },
    create: { clientId, year, month, amount, currency, notes, createdById: user.id },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: existing ? "RETAINER_FEE_UPDATED" : "RETAINER_FEE_CREATED",
      entityType: "RetainerFee",
      entityId: `${clientId}-${year}-${month}`,
      oldValue: existing ? { amount: existing.amount.toString(), currency: existing.currency } : undefined,
      newValue: { clientId, year, month, amount, currency },
    },
  });

  revalidatePath("/media/settings/retainer-fees");
  revalidatePath("/media/dashboard");
}

export async function deleteRetainerFeeAction(formData: FormData) {
  const user = await requireMediaUser();
  await requirePermission(user, "dashboard.revenue.view");

  const id = formData.get("id") as string;
  const fee = await prisma.retainerFee.delete({ where: { id }, include: { client: { select: { name: true } } } });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "RETAINER_FEE_DELETED",
      entityType: "RetainerFee",
      entityId: id,
      oldValue: { client: fee.client.name, year: fee.year, month: fee.month, amount: fee.amount.toString() },
    },
  });

  revalidatePath("/media/settings/retainer-fees");
  revalidatePath("/media/dashboard");
}
