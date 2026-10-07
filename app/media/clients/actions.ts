"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";

export async function assignAccountManagerAction(formData: FormData) {
  const user = await requireSessionUser();
  await requirePermission(user, "clients.manage_all");

  const clientId = formData.get("clientId") as string;
  const accountManagerId = (formData.get("accountManagerId") as string) || null;

  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
  await prisma.client.update({ where: { id: clientId }, data: { accountManagerId } });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "CLIENT_ACCOUNT_MANAGER_ASSIGNED",
      entityType: "Client",
      entityId: clientId,
      oldValue: { accountManagerId: client.accountManagerId },
      newValue: { accountManagerId },
    },
  });

  revalidatePath("/media/clients");
}
