"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMediaUser } from "@/lib/auth/modules";

export async function updateAssetFeeAction(formData: FormData) {
  const user = await requireMediaUser();
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    throw new Error("Only Admins can edit fees.");
  }

  const feeId = formData.get("feeId") as string;
  const raw = formData.get("amount") as string;
  const amount = raw.trim() === "" ? null : Number(raw);
  const returnTo = (formData.get("returnTo") as string) || "/media/settings/fees";

  const current = await prisma.assetFee.findUniqueOrThrow({ where: { id: feeId } });

  await prisma.assetFee.update({
    where: { id: feeId },
    data: {
      amount,
      status: amount === null ? "TBD" : "KNOWN",
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "ASSET_FEE_EDITED",
      entityType: "AssetFee",
      entityId: feeId,
      oldValue: { amount: current.amount, status: current.status },
      newValue: { amount, status: amount === null ? "TBD" : "KNOWN" },
    },
  });

  revalidatePath(returnTo);
}
